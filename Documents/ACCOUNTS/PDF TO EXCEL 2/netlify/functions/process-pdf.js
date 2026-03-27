const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { pdfBase64, pdfMediaType, templateHeaders, promptHints } =
      JSON.parse(event.body);

    if (!pdfBase64 || !templateHeaders) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Missing required fields: pdfBase64 and templateHeaders",
        }),
      };
    }

    let prompt = `You are a data extraction assistant for an aviation company. Read the entire PDF document provided. Intelligently identify all structured and unstructured content on every page. Map the extracted content to the column headers in the CSV template below.

CSV Headers:
${templateHeaders}
`;

    if (promptHints) {
      prompt += `\nCRITICAL template-specific instructions (MUST follow these):\n${promptHints}\n`;
    }

    prompt += `
Output rules:
- Return ONLY a valid CSV string.
- First row must be the headers exactly as given above.
- Following rows are the extracted data.
- If a field has commas or quotes, wrap it in double quotes and escape inner quotes by doubling them.
- If data for a column is not found in the PDF, leave that cell empty.
- Extract ALL rows of data found, not just the first one.
- No explanation, no markdown, no code fences. Just the raw CSV.`;

    const systemPrompt = promptHints
      ? `You are a data extraction assistant for Flightworx (FWX), an aviation company. You extract data from PDF invoices into CSV templates. Follow ALL template-specific instructions exactly.`
      : `You are a data extraction assistant. You extract data from PDF documents into CSV templates.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: pdfMediaType || "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const csvContent = message.content[0].text.trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvContent }),
    };
  } catch (err) {
    console.error("Error processing PDF:", err);

    if (
      err.status === 413 ||
      (err.message && err.message.includes("too large"))
    ) {
      return {
        statusCode: 413,
        body: JSON.stringify({
          error: "PDF is too large. Please use a file under 5MB.",
        }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to process PDF. Please try again.",
      }),
    };
  }
};
