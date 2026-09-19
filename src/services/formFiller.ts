import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { supabase } from '../supabase-client';
import { GeminiService } from './gemini';

export class FormFillerService {
  async processAutocomplete(userId: string, agentId: string, pastedText: string, gemini: GeminiService): Promise<{ text: string, attachment?: { filename: string, content: Buffer, contentType: string } }> {
    try {
      const { data: templates } = await supabase
        .from('user_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId);

      if (!templates || templates.length === 0) {
        return { text: 'No templates found for this module. Please upload your Blank Company Form and TXT/Filled examples in the Analyst Settings.' };
      }

      const blankTemplate = templates.find((t: any) => t.template_type === 'blank');
      const txtExample = templates.find((t: any) => t.template_type === 'txt_example');
      
      if (!blankTemplate) {
        return { text: 'Missing Blank template. Please upload a Blank Company Form with {{placeholders}} in the settings.' };
      }

      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('user-templates')
        .download(blankTemplate.storage_path);

      if (downloadErr || !fileData) {
        throw new Error('Failed to download template: ' + downloadErr?.message);
      }
      
      const buffer = Buffer.from(await fileData.arrayBuffer());

      let exampleContext = '';
      if (txtExample) {
        const { data: txtData } = await supabase.storage.from('user-templates').download(txtExample.storage_path);
        if (txtData) {
          exampleContext = `\n\nHere is an example of a TXT RA:\n"""\n${await txtData.text()}\n"""`;
        }
      }

      const prompt = `You are a data extraction AI. Extract the fields from the following Risk Assessment text to match the placeholders expected by the company's Word document template.\n${exampleContext}\n\nReturn ONLY a pure JSON object containing the key-value pairs to fill the template. Do not include markdown blocks or any other text.\n\nRisk Assessment Text to process:\n"""\n${pastedText}\n"""`;

      let jsonStr = await gemini.runGroundedQuery(prompt, '', [], 'Return pure JSON only.', 'groq', agentId);
      
      jsonStr = jsonStr.replace(/^```json/m, '').replace(/```$/m, '').trim();
      let extractedData: Record<string, any>;
      try {
        extractedData = JSON.parse(jsonStr);
      } catch (e) {
        console.warn('Failed to parse LLM JSON output. Falling back to empty object. Raw output:', jsonStr);
        extractedData = {}; 
      }

      const zip = new PizZip(buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render(extractedData);

      const generatedDocBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      return {
        text: "I have successfully processed your Risk Assessment and filled out your company's official form. Please find the attached document.",
        attachment: {
          filename: `Filled_${blankTemplate.file_name}`,
          content: generatedDocBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      };

    } catch (err) {
      console.error('FormFillerService Error:', err);
      return { text: 'Failed to autocomplete form: ' + (err as Error).message };
    }
  }
}
