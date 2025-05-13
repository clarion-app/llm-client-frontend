import { backend } from ".";

export const fetchPageText = async (url: string): Promise<string> => {
  const response = await fetch(`${backend.url}/api/clarion-app/llm-client/page-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backend.token}`,
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch page text");
  }

  const data = await response.json();
  return data.text;
}