import { supabase } from "./supabase";

type SendPushPayload = {
  userEmails: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
};

export async function sendPushToEmails({
  userEmails,
  title,
  body,
  data = {},
}: SendPushPayload) {
  const finalEmails = Array.from(
    new Set(
      userEmails
        .map((e) => (e || "").toLowerCase().trim())
        .filter(Boolean)
    )
  );

  if (finalEmails.length === 0) return;

    const { data: result, error } = await supabase.functions.invoke("send-push", {
    body: {
        userEmails: finalEmails,
        title,
        body,
        data,
    },
    headers: {
        "x-client-info": "lido-app",
    },
    });

  if (error) {
    console.log("sendPushToEmails error:", error.message);
    return;
  }

  console.log("sendPushToEmails result:", result);
}