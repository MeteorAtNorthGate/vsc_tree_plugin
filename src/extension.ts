import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    // 注册 .tree 文件的自定义折叠规则
    const foldingProvider = vscode.languages.registerFoldingRangeProvider(
        { language: 'tree' },
        new TreeFoldingProvider()
    );

    // 注册生成树形命令
    const generateCommand = vscode.commands.registerCommand('tree-generator.generateTree', async () => {
        await generateTreeFile();
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

            // 通过匹配前缀来计算树结构的深度 (4个字符为一个缩进层级)
            const match = text.match(/^(?:[│\s]   )*(?:├──|└──)/);
            if (match) {
                const depth = match[0].length / 4;

                // 遇到同级或更高级别的节点，结算之前的折叠区间
                while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
                    const prev = stack.pop();
                    if (prev && prev.line < i - 1) {
                        ranges.push(new vscode.FoldingRange(prev.line, i - 1));
                    }
                }
                stack.push({ line: i, depth });
            } else if (text.match(/^[^\s│├└]/)) {
                // 根节点
                stack.push({ line: i, depth: 0 });
            }
        }

        // 结算剩余未闭合的节点
        while (stack.length > 0) {
            const prev = stack.pop();
            if (prev && prev.line < document.lineCount - 1) {
                ranges.push(new vscode.FoldingRange(prev.line, document.lineCount - 1));
            }
        }

        return ranges;
    }
}

async function generateTreeFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // 增加 length 校验，并使用 !
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace is currently open.');
        return;
    }
    const rootPath = workspaceFolders[0]!.uri.fsPath;
    const outputPath = path.join(rootPath, 'tree.tree');

    // 预设过滤表
    let ignores: string[] = ['.git', '.venv', 'node_modules', '__pycache__', 'dist', 'build'];
    
    // 尝试合并 .gitignore 中的规则
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        const customIgnores = gitignoreContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.replace(/\/$/, '')); // 移除末尾斜杠以方便比对
        ignores = [...new Set([...ignores, ...customIgnores])];
    }

    // 简易的忽略匹配器
    const isIgnored = (name: string) => ignores.some(ig => {
        const regex = new RegExp('^' + ig.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return name === ig || regex.test(name);
    });

    let output = `${path.basename(rootPath)}/\n`;

    function buildTree(dirPath: string, prefix: string) {
        let items: fs.Dirent[];
        try {
            items = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return; // 忽略无权限读取的目录
        }

        // 文件夹优先，按字母排序
        items.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isLast = i === items.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = prefix + (isLast ? '    ' : '│   ');

            if (item!.isDirectory()) {
                output += `${prefix}${connector}${item!.name}/\n`;
                if (isIgnored(item!.name)) {
                    // 重型文件夹：输出最外层名称并用省略号替代内容
                    output += `${childPrefix}└── ...\n`;
                } else {
                    buildTree(path.join(dirPath, item!.name), childPrefix);
                }
            } else {
                if (!isIgnored(item!.name)) {
                    output += `${prefix}${connector}${item!.name}\n`;
                }
            }
        }
    }

    buildTree(rootPath, '');

    fs.writeFileSync(outputPath, output, 'utf-8');
    
    // 自动打开生成的文件
    const doc = await vscode.workspace.openTextDocument(outputPath);
    vscode.window.showTextDocument(doc);
}