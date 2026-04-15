#!/usr/bin/env node
/**
 * Restructure manuscript: split overloaded chapters, renumber, add Albert questions.
 * Run after import-manuscript.mjs has populated the initial chapters.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set env vars"); process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HOME = process.env.HOME;
const block1 = readFileSync(resolve(HOME, "Downloads/block1_chapters_1-7.txt"), "utf-8");
const block2 = readFileSync(resolve(HOME, "Downloads/block2_chapters_8-12.txt"), "utf-8");
const block3 = readFileSync(resolve(HOME, "Downloads/block3_chapters_13-16 copy.txt"), "utf-8");

function textToHtml(text) {
  return text.split(/\n\n+/).map(p => {
    p = p.trim();
    if (!p) return "";
    p = p.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).filter(Boolean).join("");
}

function alertBox(color, title, content) {
  const bg = color === "yellow" ? "#fef3c7" : "#ede9fe";
  const border = color === "yellow" ? "#f59e0b" : "#8b5cf6";
  return `<div style="background: ${bg}; border-left: 4px solid ${border}; padding: 12px; margin: 16px 0;"><strong>${title}</strong>${content}</div>`;
}

function extractBetween(text, startPattern, endPattern) {
  const startMatch = text.match(startPattern);
  if (!startMatch) return "";
  const startIdx = startMatch.index + startMatch[0].length;
  if (!endPattern) return text.slice(startIdx).trim();
  const endMatch = text.slice(startIdx).match(endPattern);
  if (!endMatch) return text.slice(startIdx).trim();
  return text.slice(startIdx, startIdx + endMatch.index).trim();
}

async function upsertChapter(id, num, title, html) {
  const content = `<h1>${title}</h1>${html}`;
  const { error } = await supabase.from("albert_documents").upsert({
    id, title, content, chapter_number: num, book_id: "albert-memoir"
  });
  if (error) console.error(`  ERROR ${id}:`, error.message);
  else console.log(`  ${num}. ${title} (${Math.round(html.length/1000)}k chars)`);

  // Save version
  await supabase.from("albert_versions").insert({
    document_id: id, content, title, message: "Restructured chapter"
  });
}

async function main() {
  console.log("Restructuring manuscript...\n");

  // ============ SPLIT CH 3 → 3 + 4 ============
  // Ch 3 "The Steppe": UCSD through returning from Mongolia
  const ch3Full = extractBetween(block1, /^CHAPTER 3\nThe Steppe\n/m, /^CHAPTER 4\n/m);
  const ch3Split = ch3Full.indexOf("The next summer I went back to Asia");
  const ch3Text = ch3Full.slice(0, ch3Split).trim();
  const ch4Text = ch3Full.slice(ch3Split).trim();

  await upsertChapter("ch-03", 3, "Chapter 3: The Steppe", textToHtml(ch3Text));
  await upsertChapter("ch-04-road", 4, "Chapter 4: The Road", textToHtml(ch4Text));

  // ============ SPLIT CH 4 → 5 + 6 ============
  const ch4Full = extractBetween(block1, /^CHAPTER 4\nTime and Pressure\n/m, /^CHAPTER 5\n/m);
  // Split before the climbing section - find the Joshua Tree / El Cap material
  const wallStart = ch4Full.indexOf("In the years prior we'd spent our weeks");
  const ch5Text = ch4Full.slice(0, wallStart).trim();
  const ch6Text = ch4Full.slice(wallStart).trim();

  await upsertChapter("ch-05", 5, "Chapter 5: Time and Pressure", textToHtml(ch5Text));
  await upsertChapter("ch-06-wall", 6, "Chapter 6: The Wall", textToHtml(ch6Text));

  // ============ RENUMBER existing chapters ============
  // Old Ch5 → New Ch7, Old Ch6 → New Ch8, Old Ch7 → New Ch9+10
  const ch5Old = extractBetween(block1, /^CHAPTER 5\nBurn the Ships\n/m, /^---\s*\n+CHAPTER 6/m);
  await upsertChapter("ch-07", 7, "Chapter 7: Burn the Ships", textToHtml(ch5Old));

  const ch6Old = extractBetween(block1, /^CHAPTER 6\nThe Sacred Mountain\n/m, /^CHAPTER 7\n/m);
  await upsertChapter("ch-08", 8, "Chapter 8: The Sacred Mountain", textToHtml(ch6Old));

  // Ch7 split → Home + Death Valley
  const ch7Full = extractBetween(block1, /^CHAPTER 7\nThe Break\n/m, null);
  // Remove trailing --- at the very end
  const ch7Clean = ch7Full.replace(/\n---\s*$/m, "").trim();
  // The RV framing and Death Valley content vs the domestic backstory
  // The chapter interleaves RV driving with flashbacks via "--" separators
  // For now, keep as one chapter but renumber
  await upsertChapter("ch-09", 9, "Chapter 9: Home", textToHtml(ch7Clean) +
    alertBox("yellow", "FOR ALBERT:", "<p>This chapter currently interleaves the RV road trip with the domestic backstory (marriage, divorce, Kara, Gil, Mongolia fallout, Jamie intro). Consider whether to:</p><ul><li>Keep the interleaved structure (it works cinematically)</li><li>Split into two chapters: one chronological backstory, one present-day RV trip</li><li>The Death Valley material at the end could become its own short chapter as a bridge to Part II</li></ul>"));

  // ============ PART II: Chapters 8-12 stay mostly intact, just renumber ============
  const ch8Old = extractBetween(block2, /^CHAPTER 8\nLimb Salvage\n/m, /^CHAPTER 9\n/m);
  await upsertChapter("ch-10", 10, "Chapter 10: Limb Salvage", textToHtml(ch8Old));

  const ch9Old = extractBetween(block2, /^CHAPTER 9\nThe Ghost\n/m, /^CHAPTER 10\n/m);
  await upsertChapter("ch-11", 11, "Chapter 11: The Ghost", textToHtml(ch9Old));

  const ch10Old = extractBetween(block2, /^CHAPTER 10\nEl Robotico\n/m, /^CHAPTER 11\n/m);
  await upsertChapter("ch-12", 12, "Chapter 12: El Robotico", textToHtml(ch10Old));

  const ch11Old = extractBetween(block2, /^CHAPTER 11\nThe Sound of the River\n/m, /^CHAPTER 12\n/m);
  await upsertChapter("ch-13", 13, "Chapter 13: The Sound of the River", textToHtml(ch11Old));

  const ch12Old = extractBetween(block2, /^CHAPTER 12\nWayfinder\n/m, null);
  const ch12Clean = ch12Old.replace(/\n---\s*$/m, "").trim();
  await upsertChapter("ch-14", 14, "Chapter 14: Wayfinder", textToHtml(ch12Clean));

  // ============ PART III: New + split chapters ============
  // Ch 15-16-17 are placeholders already created (Emperor's Ghost, Fortress, new)

  // Ch 18: El Dorado - extract Colombia material from ch13
  const ch13Full = extractBetween(block3, /^CHAPTER 13\nThe Door in the Mountain\n/m, /^---\s*\n+CHAPTER 14/m);
  const colombiaStart = ch13Full.indexOf("In Colombia, we scanned Ciudad Perdida");
  const colombiaEnd = ch13Full.indexOf("A few days later I was on the busy streets of Santa Marta");
  const colombiaEndFull = ch13Full.indexOf("\n\n", colombiaEnd);
  const colombiaText = ch13Full.slice(colombiaStart, colombiaEndFull).trim();

  await upsertChapter("ch-18", 18, "Chapter 18: El Dorado",
    textToHtml(colombiaText) +
    alertBox("yellow", "FOR ALBERT: EXPAND THIS CHAPTER",
      "<p>This is currently just 2 paragraphs from the original Ch 13. The Kogi priest material is beautiful — 'We are of the stars. All things come from the sun.' — but needs much more.</p><ul><li>What was it like entering cartel country under military escort?</li><li>The LiDAR scan of Ciudad Perdida — what did you find?</li><li>The Kogi call themselves the Elder Brothers of humanity. How did that idea sit with you?</li><li>Any crew stories, personal moments, or connections to the book's themes?</li><li>How does this episode connect to the pattern of each land having its own 'way in'?</li></ul>"));

  // Ch 19: The Door in the Mountain - first Peru expedition
  const peruStart = ch13Full.indexOf("And then my father told me something");
  const peruFirstEnd = ch13Full.indexOf("No LiDAR could see what Elder had shown me.");
  const peruFirstEndFull = ch13Full.indexOf("\n\n", peruFirstEnd);
  const peru1Text = ch13Full.slice(peruStart, peruFirstEndFull).trim();
  await upsertChapter("ch-19", 19, "Chapter 19: The Door in the Mountain", textToHtml(peru1Text));

  // Ch 20: The Bones of Children - second Peru + river disaster
  const peru2Start = ch13Full.indexOf("The second time I came to Peru");
  const peru2Text = ch13Full.slice(peru2Start).trim();
  await upsertChapter("ch-20", 20, "Chapter 20: The Bones of Children", textToHtml(peru2Text));

  // Ch 21: The Cloud Warriors - from ch14, the Chachapoya + river return
  const ch14Full = extractBetween(block3, /^CHAPTER 14\nThe Axis Mundi\n/m, /^---\s*\n+CHAPTER 15/m);
  const chacha = ch14Full.indexOf("A couple of weeks passed");
  const chachaEnd = ch14Full.indexOf("By February of 2023");
  const ch21Text = ch14Full.slice(chacha, chachaEnd).trim();
  await upsertChapter("ch-21", 21, "Chapter 21: The Cloud Warriors", textToHtml(ch21Text));

  // Ch 22: The Axis Mundi - Chiapas/Metzabok from ch14
  const metzabokStart = ch14Full.indexOf("One of our episodes had been filmed in Oman");
  const metzabokText = ch14Full.slice(metzabokStart).trim();
  await upsertChapter("ch-22", 22, "Chapter 22: The Axis Mundi", textToHtml(metzabokText));

  // ============ PART IV ============
  // Ch 23: Shadowlight - first half of ch15
  const ch15Full = extractBetween(block3, /^CHAPTER 15\nDancing Across the Universe\n/m, /^---\s*\n+CHAPTER 16/m);
  const ecuadorStart = ch15Full.indexOf("Then I was invited to climb Mount Cayambe");
  const ch23Text = ch15Full.slice(0, ecuadorStart).trim();
  await upsertChapter("ch-23", 23, "Chapter 23: Shadowlight", textToHtml(ch23Text));

  // Ch 24: Dancing Across the Universe - second half of ch15
  const ch24Text = ch15Full.slice(ecuadorStart).trim();
  await upsertChapter("ch-24", 24, "Chapter 24: Dancing Across the Universe", textToHtml(ch24Text));

  // Ch 25: The Boy and the Butterfly - ch16 part 1
  const ch16Full = extractBetween(block3, /^CHAPTER 16\nThe Boy and the Butterfly\n/m, /^---\s*\n+EPILOGUE/m);
  const protocolStart = ch16Full.indexOf("We built the only thing we could");
  const ch25Text = ch16Full.slice(0, protocolStart).trim();
  await upsertChapter("ch-25", 25, "Chapter 25: The Boy and the Butterfly", textToHtml(ch25Text));

  // Ch 26: The Protocol - ch16 part 2
  const returnStart = ch16Full.indexOf("He wouldn't kill a bug");
  const ch26Text = ch16Full.slice(protocolStart, returnStart).trim();
  await upsertChapter("ch-26", 26, "Chapter 26: The Protocol",
    textToHtml(ch26Text) +
    alertBox("yellow", "FOR ALBERT: EXPAND THIS CHAPTER",
      "<p>This is the payoff for the entire book. Everything you learned in the field — shamanic breathwork, nomadic sleep rhythms, music frequencies, Varanasi's drum temples — converges here in your son's recovery. Currently compressed into a few paragraphs. It needs to be the richest chapter in the book.</p><ul><li>What specific breathwork techniques did you use? How did you connect them to shamanic traditions?</li><li>The music frequencies — what were you playing at his bedside? How did it connect to what you learned with Jamie and in Varanasi?</li><li>The neuroplasticity research — what studies mattered most? What did you synthesize at 2AM?</li><li>How did you structure the visualization meditations? What was Deena's role?</li><li>The nomadic sleep rhythms — what did you learn from the gers that applied here?</li><li>The diet protocol — more detail on the science behind the choices</li><li>When did you realize everything you'd searched for in distant places had been preparing you for this room?</li></ul>"));

  // Ch 27: The Return - ch16 part 3
  const ch27Text = ch16Full.slice(returnStart).trim();
  await upsertChapter("ch-27", 27, "Chapter 27: The Return", textToHtml(ch27Text));

  // Epilogue stays as-is but renumber to 28
  const epilogueText = extractBetween(block3, /\nEPILOGUE\s*\n/m, null);
  await upsertChapter("ch-28", 28, "Epilogue", textToHtml(epilogueText.trim()));

  // ============ Clean up old chapter IDs ============
  console.log("\nCleaning up old chapter IDs...");
  const oldIds = ["ch-01","ch-02","ch-03","ch-04","ch-05","ch-06","ch-07",
                  "ch-08","ch-09","ch-10","ch-11","ch-12","ch-13","ch-14",
                  "ch-15","ch-16","ch-17"];
  // Only delete if the new ones exist
  const { data: newDocs } = await supabase.from("albert_documents")
    .select("id").like("id", "ch-%").neq("book_id", null);

  if (newDocs && newDocs.length > 20) {
    // Delete versions first, then docs
    for (const oldId of oldIds) {
      // Don't delete if the ID is reused in the new structure
      const isReused = ["ch-03","ch-05","ch-07","ch-08","ch-09","ch-10",
                        "ch-11","ch-12","ch-13","ch-14"].includes(oldId);
      if (!isReused) {
        await supabase.from("albert_versions").delete().eq("document_id", oldId);
        await supabase.from("albert_documents").delete().eq("id", oldId);
        console.log(`  Deleted ${oldId}`);
      }
    }
  }

  console.log("\nDone! New structure:");
  const { data: final } = await supabase.from("albert_documents")
    .select("chapter_number, title")
    .not("chapter_number", "is", null)
    .order("chapter_number");

  for (const ch of final || []) {
    console.log(`  ${ch.chapter_number}. ${ch.title}`);
  }
}

main().catch(console.error);
