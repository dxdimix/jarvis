export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "processing" | "done" | "error";

export type Message = {
  id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  reply_to: string | null;
  error: string | null;
  created_at: string;
};
