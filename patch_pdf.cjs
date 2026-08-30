const fs = require('fs');
let code = fs.readFileSync('server/semanticEngine.ts', 'utf8');
const searchStr = `    if (fileType === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default || (await import("pdf-parse"));
      const data = await (pdfParse as any)(buffer);
      text = data.text;
    }`;
const replaceStr = `    if (fileType === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const data = await parser.getText();
      await parser.destroy();
      text = data.text;
    }`;
code = code.replace(searchStr, replaceStr);
fs.writeFileSync('server/semanticEngine.ts', code);
