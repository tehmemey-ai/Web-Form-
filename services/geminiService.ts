import { GoogleGenAI, Type, Schema } from "@google/genai";
import { RequestCategory, CategorySuggestionResponse } from "../types";

const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing from environment variables.");
    throw new Error("API Key missing");
  }
  return new GoogleGenAI({ apiKey });
};

export const refineDescription = async (text: string): Promise<string> => {
  const ai = getClient();
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a professional business communication assistant. 
      Rewrite the following data request description to be more precise, professional, and clear. 
      Keep the core intent but improve the phrasing for a technical data team.
      
      Original text: "${text}"`,
    });
    
    return response.text || text;
  } catch (error) {
    console.error("Error refining text:", error);
    return text;
  }
};

export const suggestCategory = async (description: string): Promise<CategorySuggestionResponse | null> => {
  const ai = getClient();

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        enum: [
            RequestCategory.Bahan_Paparan,
            RequestCategory.Bahan_Perencanaan_dan_Penyusunan_Kebijakan,
            RequestCategory.Bahan_Publikasi,
            RequestCategory.Bahan_Monitoring_dan_Evaluasi,
            RequestCategory.Penelitian,
            RequestCategory.TL_Disposisi,
            RequestCategory.OTHER
        ],
        description: "The most suitable category for the data request."
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score between 0 and 1."
      },
      reasoning: {
        type: Type.STRING,
        description: "Brief explanation of why this category was chosen."
      }
    },
    required: ["category", "confidence", "reasoning"]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze the following data request description and categorize it into one of the defined categories.
      
      Description: "${description}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const text = response.text;
    if (!text) return null;
    
    return JSON.parse(text) as CategorySuggestionResponse;
  } catch (error) {
    console.error("Error categorizing request:", error);
    return null;
  }
};