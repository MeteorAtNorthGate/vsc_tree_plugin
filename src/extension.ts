import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const foldingProvider = vscode.languages.registerFoldingRangeProvider(
        { language: 'tree' },
        new TreeFoldingProvider()
    );

    // 修改：允许接收右键菜单传入的 uri 参数
    const generateCommand = vscode.commands.registerCommand('tree-generator.generateTree', async (uri?: vscode.Uri) => {
        await generateTreeFile(uri);
    });

    context.subscriptions.push(foldingProvider, generateCommand);
}

class TreeFoldingProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(document: vscode.TextDocument): vscode.ProviderResult<vscode.FoldingRange[]> {
        const ranges: vscode.FoldingRange[] = [];
        const stack: { line: number, depth: number }[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            if (!text.trim()) continue;

            const match = text.match(/^(?:[│\s]   )*(?:├──|└──)/);
            if (match) {
                const depth = match[0].length / 4;

                while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
                    const prev = stack.pop();
                    if (prev && prev.line < i - 1) {
                        ranges.push(new vscode.FoldingRange(prev.line, i - 1));
                    }
                }
                stack.push({ line: i, depth });
            } else if (text.match(/^[^\s│├└]/)) {
                stack.push({ line: i, depth: 0 });
            }
        }

        while (stack.length > 0) {
            const prev = stack.pop();
            if (prev && prev.line < document.lineCount - 1) {
                ranges.push(new vscode.FoldingRange(prev.line, document.lineCount - 1));
            }
        }

        return ranges;
    }
}

async function generateTreeFile(uri?: vscode.Uri) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders && workspaceFolders[0] ? workspaceFolders[0].uri.fsPath : undefined;

    let currentRoot: string;

    // 1. 确定当前生成树的父节点路径
    if (uri && uri.fsPath) {
        try {
            const stats = fs.statSync(uri.fsPath);
            if (stats.isDirectory()) {
                currentRoot = uri.fsPath;
            } else {
                currentRoot = path.dirname(uri.fsPath);
            }
        } catch {
            if (!workspaceRoot) return;
            currentRoot = workspaceRoot;
        }
    } else {
        // 快捷键或命令面板触发，且无激活文件时， fallback 到工作区根目录
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace is currently open.');
            return;
        }
        currentRoot = workspaceRoot;
    }

    const outputPath = path.join(currentRoot, 'tree.tree');

    // 2. 预设重型文件夹过滤表
    let ignores: string[] = ['.git', '.venv', 'node_modules', '__pycache__', 'dist', 'build'];
    
    // 3. 【核心设计】小心处理 .gitignore 路径定位与路径计算
    let gitignorePath = '';
    let gitignoreBaseDir = currentRoot;

    // 策略：从当前树的根节点开始逐级向上查找，直到工作区根目录，寻找最近的 .gitignore
    let checkDir = currentRoot;
    while (checkDir) {
        const potentialGitignore = path.join(checkDir, '.gitignore');
        if (fs.existsSync(potentialGitignore)) {
            gitignorePath = potentialGitignore;
            gitignoreBaseDir = checkDir;
            break;
        }
        if (workspaceRoot && checkDir === workspaceRoot) {
            break;
        }
        const parent = path.dirname(checkDir);
        if (parent === checkDir) break; // 已到达操作系统根驱动器
        checkDir = parent;
    }

    // 降级策略：如果在上溯过程中没找到，且存在工作区，直接看一眼工作区根目录
    if (!gitignorePath && workspaceRoot && fs.existsSync(path.join(workspaceRoot, '.gitignore'))) {
        gitignorePath = path.join(workspaceRoot, '.gitignore');
        gitignoreBaseDir = workspaceRoot;
    }

    // 加载 .gitignore 的规则
    if (gitignorePath) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        const customIgnores = gitignoreContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.replace(/\/$/, ''));
        ignores = [...new Set([...ignores, ...customIgnores])];
    }

    // 4. 精准匹配器：融合绝对名字匹配与相对路径匹配
    const isIgnored = (itemName: string, itemFullPath: string) => {
        // 计算相对于 .gitignore 所在基准目录的相对路径，并将 Windows 的 \ 统一转化为 Git 标准的 /
        const relativePath = path.relative(gitignoreBaseDir, itemFullPath).replace(/\\/g, '/');
        
        return ignores.some(ig => {
            const rule = ig.replace(/\/$/, '');
            
            // 规则 A：文件名或文件夹名直接匹配 (例如: 'node_modules')
            if (itemName === rule) return true;
            
            // 规则 B：相对路径精准匹配 (例如: 'apps/web-client/dist')
            if (relativePath === rule) return true;
            
            // 规则 C：通配符转正则表达式模糊匹配
            const regexStr = '^' + rule.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '($|/)';
            const regex = new RegExp(regexStr);
            return regex.test(itemName) || regex.test(relativePath);
        });
    };

    let output = `${path.basename(currentRoot)}/\n`;

    function buildTree(dirPath: string, prefix: string) {
        let items: fs.Dirent[];
        try {
            items = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return;
        }

        items.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < items.length; i++) {
            const item = items[i]!;
            const isLast = i === items.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            
            const itemFullPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                output += `${prefix}${connector}${item.name}/\n`;
                if (isIgnored(item.name, itemFullPath)) {
                    output += `${childPrefix}└── ...\n`;
                } else {
                    buildTree(itemFullPath, childPrefix);
                }
            } else {
                if (!isIgnored(item.name, itemFullPath)) {
                    output += `${prefix}${connector}${item.name}\n`;
                }
            }
        }
    }

    buildTree(currentRoot, '');

    fs.writeFileSync(outputPath, output, 'utf-8');
    
    const doc = await vscode.workspace.openTextDocument(outputPath);
    vscode.window.showTextDocument(doc);
}