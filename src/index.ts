import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// MarkdownV2 特殊字符转义函数
function escapeMarkdownV2(text: string): string {
	// MarkdownV2 需要转义的特殊字符
	const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
	let escaped = text;
	
	for (const char of specialChars) {
		escaped = escaped.replace(new RegExp(`\\${char}`, 'g'), `\\${char}`);
	}
	
	return escaped;
}

// Define our MCP agent with tools
export class ChannelMCP extends McpAgent<Env> {
	server = new McpServer({
		name: "Telegram Channel MCP",
		version: "0.0.1",
	});

	async init() {
		// send a message to the Channel
		this.server.tool(
			"send-message-to-channel",
			{
				message: z.string(),
				parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML", "none"]).optional().describe("消息解析模式，默认为none（纯文本）"),
			},
			async ({ message, parse_mode = "none" }) => {
				try {
					// 验证环境变量
					const botToken = this.env.BOT_TOKEN;
					const chatId = this.env.CHANNEL_ID;
					
					if (!botToken || !chatId) {
						throw new Error("Missing required environment variables: BOT_TOKEN or CHANNEL_ID");
					}

					// 根据解析模式处理消息内容
					let processedMessage = message;
					const requestBody: any = {
						chat_id: chatId,
						text: processedMessage,
					};

					// 只有非none模式才添加parse_mode
					if (parse_mode !== "none") {
						if (parse_mode === "MarkdownV2") {
							// 自动转义MarkdownV2特殊字符
							processedMessage = escapeMarkdownV2(message);
							requestBody.text = processedMessage;
						}
						requestBody.parse_mode = parse_mode;
					}

					// 发送消息到 Telegram 频道
					const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
					
					const response = await fetch(telegramApiUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(requestBody),
					});

					// 检查响应状态
					if (!response.ok) {
						const errorData = await response.text();
						throw new Error(`Telegram API error (${response.status}): ${errorData}`);
					}

					const responseData: { ok: boolean, description?: string, result?: any } = await response.json();
					
					// 验证响应是否成功
					if (!responseData.ok) {
						throw new Error(`Telegram API returned error: ${responseData.description || 'Unknown error'}`);
					}

					return { 
						content: [{ 
							type: "text", 
							text: `消息发送成功！使用解析模式: ${parse_mode}` 
						}] 
					};

				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : '未知错误';
					return { 
						content: [{ 
							type: "text", 
							text: `发送消息失败: ${errorMessage}` 
						}] 
					};
				}
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return ChannelMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return ChannelMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
