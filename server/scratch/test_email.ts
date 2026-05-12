import dotenv from 'dotenv';
dotenv.config();

import { sendReceipt } from '../src/services/emailService';

async function test() {
  console.log('🚀 Testing Resend Email Service...');
  
  if (!process.env.RESEND_API_KEY) {
    console.error('❌ Error: RESEND_API_KEY is not loaded. Check your .env file path.');
    return;
  }

  console.log(`📡 Using API Key: ${process.env.RESEND_API_KEY.substring(0, 7)}... (Truncated)`);
  console.log(`📧 From Address: ${process.env.RESEND_FROM || 'not set'}`);
  
  const testEmail = 'ajmalsaleem84@gmail.com'; // Change this to your verified email
  const invoiceNumber = 'INV-1001';
  const grandTotal = 1250.50;
  const items = [
    { name: 'Wireless Mouse', quantity: 1, total: 450.00 },
    { name: 'Mechanical Keyboard', quantity: 1, total: 800.50 }
  ];

  const result = await sendReceipt(testEmail, invoiceNumber, grandTotal, items);

  if (result.success) {
    console.log('✅ Email sent successfully!');
    console.log('Data:', result.data);
  } else {
    console.log('❌ Failed to send email.');
    console.log('Error:', result.error);
  }
}

test();
