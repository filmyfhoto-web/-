// Convert number to Thai baht text
const TH_NUM = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const TH_POS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

function readInt(numStr: string): string {
  if (numStr === "0") return "";
  const len = numStr.length;
  if (len > 7) {
    const head = numStr.slice(0, len - 6);
    const tail = numStr.slice(len - 6).padStart(6, "0");
    return readInt(head) + "ล้าน" + (readInt(tail.replace(/^0+/, "") || "0") || "");
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    const d = parseInt(numStr[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่";
    else if (pos === 1 && d === 1) out += "";
    else out += TH_NUM[d];
    out += TH_POS[pos];
  }
  return out;
}

export function bahttext(amount: number): string {
  if (!isFinite(amount)) return "";
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const [bahtStr, satRaw = "00"] = abs.toFixed(2).split(".");
  const satStr = satRaw.padEnd(2, "0").slice(0, 2);
  const bahtTxt = readInt(bahtStr) || "ศูนย์";
  let out = (negative ? "ลบ" : "") + bahtTxt + "บาท";
  if (satStr === "00") out += "ถ้วน";
  else out += readInt(satStr) + "สตางค์";
  return out;
}