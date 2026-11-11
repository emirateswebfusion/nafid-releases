import { isVatStore } from '../../localization/storeProfile';
import { generateUaeReceipt } from '../uaeInvoice';
import { getEffectiveBillSettings, type ReceiptData } from './receiptCore';
import { renderStandardReceipt } from './styles/standard';
import { renderCompactReceipt } from './styles/compact';
import { renderModernReceipt } from './styles/modern';
import { renderCleanReceipt } from './styles/clean';
import { renderClassicReceipt } from './styles/classic';
import { renderDotReceipt } from './styles/dot';
import { renderSlimReceipt } from './styles/slim';
import { renderLuxeReceipt } from './styles/luxe';
import { renderBoxedReceipt } from './styles/boxed';

/** Shared state and helpers for one receipt: column width, padding / wrapping helpers and effective bill settings. */
function createReceiptTextContext(data: ReceiptData, widthCm: number, charsPerLine?: number) {
  if (charsPerLine == null) {
    charsPerLine = widthCm >= 7.5 ? 42 : 32;
  }

  const centerText = (text: string, width: number): string => {
    if (text.length >= width) return text.substring(0, width);
    const padLeft = Math.floor((width - text.length) / 2);
    return ' '.repeat(padLeft) + text + ' '.repeat(width - text.length - padLeft);
  };

  const padRight = (text: string, width: number): string => {
    return text.length > width ? text.substring(0, width) : text.padEnd(width, ' ');
  };

  const padLeft = (text: string, width: number): string => {
    return text.length > width ? text.substring(0, width) : text.padStart(width, ' ');
  };

  // Wraps text to fit the given width, breaking on word boundaries and hard-breaking
  // very long single words. Used when printFullName is enabled.
  const wrapText = (text: string, width: number): string[] => {
    if (!text) return [''];
    if (width <= 0) return [text];
    if (text.length <= width) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let current = '';
    const flush = () => {
      if (current) { lines.push(current); current = ''; }
    };
    for (const word of words) {
      if ((current + (current ? ' ' : '') + word).length <= width) {
        current += (current ? ' ' : '') + word;
      } else {
        flush();
        if (word.length > width) {
          let chunk = word;
          while (chunk.length > width) {
            lines.push(chunk.substring(0, width));
            chunk = chunk.substring(width);
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    flush();
    return lines;
  };

  const isGstBill = data.invoiceType === 'GST' || Boolean(data.isB2B);
  const selectedBillSettings = getEffectiveBillSettings(data.billSettings, isGstBill);
  const printFullName = selectedBillSettings.printFullName !== false;
  const showBrand = selectedBillSettings.showBrandName !== false;
  const isRateQty = selectedBillSettings.itemColumnOrder === 'rate_qty';

  const appendInstructions = (t: string): string => {
    const instr = data.billSettings?.instructions;
    if (!instr) return t;
    const lines = instr.split('\n').filter(l => l.trim());
    if (lines.length === 0) return t;
    const dash = '-'.repeat(charsPerLine);
    let out = t + '\n' + dash + '\n';
    out += centerText('TERMS & CONDITIONS', charsPerLine) + '\n';
    for (const line of lines) {
      out += centerText(line.trim(), charsPerLine) + '\n';
    }
    out += dash + '\n';
    return out;
  };

  const appendLoyaltyBlock = (t: string): string => {
    const points = data.pointsEarned || data.previousPointsBalance || data.pointsRedeemed || data.remainingPointsBalance;
    if (!points) return t;
    const dash = '-'.repeat(charsPerLine);
    const lw = charsPerLine - 12 - 2;
    const tw = 12;
    let out = t + '\n';
    out += centerText('LOYALTY POINTS', charsPerLine) + '\n';
    if (data.previousPointsBalance != null && data.previousPointsBalance !== 0) {
      out += `${padRight('Previous Balance', lw)}  ${padLeft(data.previousPointsBalance.toFixed(0), tw)}\n`;
    }
    if (data.pointsEarned && data.pointsEarned > 0) {
      out += `${padRight('Earned This Bill', lw)}  ${padLeft(`+${data.pointsEarned.toFixed(0)}`, tw)}\n`;
    }
    if (data.pointsRedeemed && data.pointsRedeemed > 0) {
      out += `${padRight('Redeemed', lw)}  ${padLeft(`-${data.pointsRedeemed.toFixed(0)}`, tw)}\n`;
      if (data.pointsRedeemedDiscount && data.pointsRedeemedDiscount > 0) {
        out += `${padRight('Discount Value', lw)}  ${padLeft(`-${data.pointsRedeemedDiscount.toFixed(2)}`, tw)}\n`;
      }
    }
    if (data.remainingPointsBalance != null) {
      out += `${padRight('Balance', lw)}  ${padLeft(data.remainingPointsBalance.toFixed(0), tw)}\n`;
    }
    out += dash + '\n';
    return out;
  };

  return {
    data, widthCm, charsPerLine, centerText, padRight, padLeft, wrapText,
    isGstBill, selectedBillSettings, printFullName, showBrand, isRateQty, appendInstructions, appendLoyaltyBlock,
  };
}

export type ReceiptTextContext = ReturnType<typeof createReceiptTextContext>;

export type ReceiptStyle = 'standard' | 'compact' | 'modern' | 'classic' | 'clean' | 'dot' | 'slim' | 'luxe' | 'boxed';

export function generateReceiptText(data: ReceiptData, widthCm: number = 8.0, charsPerLine?: number, style: ReceiptStyle | string = 'boxed'): string {
  if (isVatStore()) return generateUaeReceipt(data, charsPerLine ?? (widthCm >= 7.5 ? 42 : 32));
  const ctx = createReceiptTextContext(data, widthCm, charsPerLine);
  let text = '';

  if (style === 'standard') {
    text = renderStandardReceipt(ctx);
  }
  else if (style === 'compact') {
    text = renderCompactReceipt(ctx);
  }
  else if (style === 'modern') {
    text = renderModernReceipt(ctx);
  }
  else if (style === 'clean') {
    text = renderCleanReceipt(ctx);
  }
  else if (style === 'classic') {
    text = renderClassicReceipt(ctx);
  }
  else if (style === 'dot') {
    text = renderDotReceipt(ctx);
  }
  else if (style === 'slim') {
    text = renderSlimReceipt(ctx);
  }
  else if (style === 'luxe') {
    text = renderLuxeReceipt(ctx);
  }
  else if (style === 'boxed') {
    text = renderBoxedReceipt(ctx);
  }

  return text;
}
