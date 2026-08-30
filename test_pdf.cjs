const fs = require('fs');
async function test() {
  try {
    const pdf = require('pdf-parse');
    const buffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Count 1\n/Kids [ 3 0 R ]\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [ 0 0 612 792 ]\n/Resources << >>\n/Contents 4 0 R\n>>\nendobj\n4 0 obj\n<<\n/Length 55\n>>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(Hello World) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000219 00000 n \ntrailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n323\n%%EOF");
    const data = await pdf.PDFParse(buffer);
    console.log("PDF Text:", data.text);
  } catch (e) {
    console.error("Failed:", e);
  }
}
test();
