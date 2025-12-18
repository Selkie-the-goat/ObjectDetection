import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

export interface MapPlace {
    title: string;
    lat: number;
    lng: number;
    description: string;
}

export interface MapResult {
    text: string;
    places: MapPlace[];
}

export async function askForDirections(query: string, latitude: number, longitude: number, isWheelchairAccessible: boolean = false): Promise<MapResult> {
  try {
    // We explicitly ask the model to format the output so we can extract coordinates for the map.
    const instruction = isWheelchairAccessible 
        ? "Prioritize wheelchair accessible locations with ramps and wide entrances." 
        : "";

    const finalQuery = `
      I am at Latitude: ${latitude}, Longitude: ${longitude}.
      Find places for: "${query}". ${instruction}
      
      CRITICAL INSTRUCTION:
      You must provide the exact estimated Latitude and Longitude for each place found so I can plot them on a map.
      
      Format your response strictly like this:
      1. Provide a helpful summary text for the user.
      2. Then, list the locations using this specific separator format on new lines:
      MARKER: Name | Latitude | Longitude | Short Description
      
      Example:
      MARKER: Central Station | 40.7128 | -74.0060 | Main accessible entrance on 42nd St.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: finalQuery,
      config: {
        // We still use googleMaps for grounding to ensure the model has access to real data
        tools: [{ googleMaps: {} }],
        toolConfig: {
            retrievalConfig: {
                latLng: {
                    latitude,
                    longitude
                }
            }
        }
      }
    });

    const text = response.text || "I found some information.";
    
    // Parse the text to find our custom MARKER format
    const places: MapPlace[] = [];
    const lines = text.split('\n');
    const markerRegex = /MARKER:\s*(.+?)\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)\s*\|\s*(.*)/;

    for (const line of lines) {
        const match = line.match(markerRegex);
        if (match) {
            const lat = parseFloat(match[2]);
            const lng = parseFloat(match[3]);
            
            // Basic validation to ensure valid coordinates
            if (!isNaN(lat) && !isNaN(lng)) {
                places.push({
                    title: match[1].trim(),
                    lat: lat,
                    lng: lng,
                    description: match[4].trim()
                });
            }
        }
    }

    return { text, places };
  } catch (error) {
    console.error("Map Error:", error);
    return { text: "Sorry, I couldn't fetch directions at this moment.", places: [] };
  }
}