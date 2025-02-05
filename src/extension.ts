import * as vscode from 'vscode';

// Called when extension is activated
export async function activate(context: vscode.ExtensionContext) {
    let apiKey = await vscode.window.showInputBox({
        prompt: "Enter your qBraid API Key",
        ignoreFocusOut: true,
        password: true
    });

    if (!apiKey) {
        vscode.window.showErrorMessage("API key is required to use qBraid Chat.");
        return;
    }

    let disposable = vscode.commands.registerCommand('qbraid-chat.start', async () => {
        const panel = vscode.window.createWebviewPanel(
            'qbraidChat',
            'qBraid Chat',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        // Fetching models before loading the webview content
        const models = await getAvailableModels(apiKey);

        panel.webview.html = getWebviewContent(context.extensionUri);

        // Sending models list to the WebView
        panel.webview.postMessage({ command: 'modelsList', models });

        // Handling messages from the WebView
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'sendMessage') {
                await handleChatMessage(message, panel, apiKey);
            }
        });
    });

    context.subscriptions.push(disposable);
}

// Function to handle chat messages
async function handleChatMessage(message: any, panel: vscode.WebviewPanel, apiKey: string) {
    if (!apiKey) {
        vscode.window.showErrorMessage("API key not found. Please enter your qBraid API key.");
        return;
    }

    try {
        const options = {
            method: 'POST',
            headers: { 
                'api-key': apiKey, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                prompt: message.text,
                model: message.model,
                stream: false
            })
        };

        console.log(message.model)

        const response = await fetch('https://api.qbraid.com/api/chat', options);
        const responseData = await response.json();

        console.log("Chat API Response:", responseData);

        // Sending response back to WebView
        panel.webview.postMessage({ command: 'chatResponse', response: responseData });

    } catch (error) {
        console.error("Error fetching chat response:", error);
        vscode.window.showErrorMessage("Failed to fetch response from qBraid API.");
    }
}

// Function to fetch available models
async function getAvailableModels(apiKey: string): Promise<string[]> {
    const url = 'https://api.qbraid.com/api/chat/models';

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'api-key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        const data: any = await response.json();
        console.log("Full API response:", data);

        // Extracting only the model names
        const models = data.map((modelObj: { model: string }) => modelObj.model);

        console.log("Extracted models:", models); 
        return models;
    } catch (error) {
        console.error("Error fetching models:", error);
        vscode.window.showErrorMessage("Failed to fetch models. Check your API key.");
        return [];
    }
}


// Function to generate WebView content
function getWebviewContent(extensionUri: vscode.Uri): string {
    const cssUri = vscode.Uri.joinPath(extensionUri, 'styles', 'main.css'); 
    
    return `
        <html>
        <head>
            <link rel="stylesheet" type="text/css" href="${cssUri}">
        </head>
       <body>
            <div class="container">
                <div class="header">qBraid Chat</div>

                <div class="chat-box" id="chatBox"></div>

                <div class="input-container">
                    <select id="model"></select>
                    <input id="message" type="text" placeholder="Type a message...">
                    <button onclick="sendMessage()">➤</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let selectedModel = "";

                window.addEventListener('message', event => {
                    if (event.data.command === 'modelsList') {
                        const models = event.data.models;
                        const select = document.getElementById('model');
                        select.innerHTML = "";

                        models.forEach(model => {
                            let option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            select.appendChild(option);
                        });

                        selectedModel = models[0] || "";
                        select.value = selectedModel;
                    } else if (event.data.command === 'chatResponse') {
                        appendMessage(event.data.response.content, 'bot-message');
                    }
                });

                document.getElementById('model').addEventListener('change', function() {
                    selectedModel = this.value;
                });

                function sendMessage() {
                    const message = document.getElementById('message').value;
                    if (!message.trim()) return;

                    appendMessage(message, 'user-message');
                    vscode.postMessage({ command: 'sendMessage', text: message, model: selectedModel });
                    document.getElementById('message').value = '';
                }

                function appendMessage(text, className) {
                    const chatBox = document.getElementById('chatBox');
                    const msg = document.createElement('div');
                    msg.classList.add('message', className);
                    msg.textContent = text;
                    chatBox.appendChild(msg);
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            </script>
        </body>
        </html>
    `;
}



// Called when extension is deactivated
export function deactivate() {}
