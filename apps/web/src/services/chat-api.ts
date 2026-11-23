const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000";

export async function sendChatMessage(message: string): Promise<string> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`);
  }

  const body: unknown = await response.json();

  if (
    typeof body !== "object" ||
    body === null ||
    !("answer" in body) ||
    typeof body.answer !== "string"
  ) {
    throw new Error("Unexpected response from chat API");
  }

  return body.answer;
}
