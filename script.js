// ====== 설정 ======
const STORAGE_KEY = "cn_vocab_cards_v2"; // v2로 마이그레이션
const THEME_KEY = "cn_vocab_theme";
const nowISO = () => new Date().toISOString();

// ====== 상태 ======
let words = []; // [{id, hanzi, pinyin, meaning, pos, example, chapter, createdAt, updatedAt, srs:{interval, ease, due, reps}}]
let ui = {
  search: "",
  filterPos: "",
  filterChapter: "",
  sortBy: "recent",
  theme: "dark",
  cardDirection: "hanziToMeaning", // "meaningToHanzi"
  autoSpeak: false
};

// ====== 유틸 ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const supportsTTS = "speechSynthesis" in window;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ words }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.words)) {
        words = data.words;
      }
    } catch {}
  } else {
    // v1에서 자동 마이그레이션 (이전 키가 있다면)
    const v1 = localStorage.getItem("cn_vocab_cards_v1");
    if (v1) {
      try {
        const data = JSON.parse(v1);
        if (Array.isArray(data.words)) {
          words = data.words.map(w => ({
            chapter: "", // 신규 필드
            ...w
          }));
          save();
        }
      } catch {}
    }
  }
  // 필드 보정
  words = words.map(w => ({
    srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0 },
    chapter: "",
    ...w,
    srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0, ...(w.srs || {}) },
    chapter: w.chapter ?? ""
  }));
}

function setTheme(mode){
  const root = document.documentElement;
  root.setAttribute("data-theme", mode === "light" ? "light" : "dark");
  localStorage.setItem(THEME_KEY, mode);
  ui.theme = mode;
}

function humanDate(iso){
  if(!iso) return "—";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function download(filename, text){
  const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s){
  if(s == null) return "";
  const str = String(s);
  if(/[",\n]/.test(str)) return `"${str.replace(/"/g,'""')}"`;
  return str;
}

function escapeHTML(str){
  return (str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

// ====== DOM 참조 ======
const wordForm = $("#wordForm");
const wordId = $("#wordId");
const hanzi = $("#hanzi");
const pinyin = $("#pinyin");
const meaning = $("#meaning");
const pos = $("#pos");
const example = $("#example");
const chapter = $("#chapter");
const resetBtn = $("#resetBtn");

const search = $("#search");
const filterPos = $("#filterPos");
const filterChapter = $("#filterChapter");
const sortBy = $("#sortBy");
const exportJsonBtn = $("#exportJsonBtn");
const exportCsvBtn = $("#exportCsvBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
const clearAllBtn = $("#clearAllBtn");
const wordCount = $("#wordCount");
const wordTbody = $("#wordTbody");
const toggleThemeBtn = $("#toggleThemeBtn");

const openFlashcardBtn = $("#openFlashcardBtn");
const flashcardModal = $("#flashcardModal");
const closeFlashBtn = $("#closeFlashBtn");
const flashcard = $("#flashcard");
const flashFront = $("#flashFront");
const flashBack = $("#flashBack");
const flashPinyin = $("#flashPinyin");
const flashMeaning = $("#flashMeaning");
const flashExample = $("#flashExample");
const flashIndex = $("#flashIndex");
const flashTotal = $("#flashTotal");
const prevCardBtn = $("#prevCardBtn");
const nextCardBtn = $("#nextCardBtn");
const flipCardBtn = $("#flipCardBtn");
const gradeAgain = $("#gradeAgain");
const gradeGood = $("#gradeGood");
const gradeEasy = $("#gradeEasy");
const dueOnly = $("#dueOnly");
const cardDirection = $("#cardDirection");
const speakBtn = $("#speakBtn");
const ttsNote = $("#ttsNote");
const autoSpeak = $("#autoSpeak");

// ====== 렌더링 ======
function refreshChapterFilterOptions(){
  const set = new Set(words.map(w => (w.chapter || "").trim()).filter(Boolean));
  const current = filterChapter.value;
  filterChapter.innerHTML = `<option value="">전체</option>` +
    Array.from(set).sort((a,b)=>a.localeCompare(b)).map(ch => `<option>${escapeHTML(ch)}</option>`).join("");
  // 기존 선택 유지
  if ([...filterChapter.options].some(o=>o.value===current)) filterChapter.value = current;
}

function renderTable(){
  const q = ui.search.trim().toLowerCase();
  let list = words.slice();

  if(ui.filterPos) list = list.filter(w => (w.pos || "") === ui.filterPos);
  if(ui.filterChapter) list = list.filter(w => (w.chapter || "") === ui.filterChapter);
  if(q){
    list = list.filter(w =>
      (w.hanzi||"").toLowerCase().includes(q) ||
      (w.pinyin||"").toLowerCase().includes(q) ||
      (w.meaning||"").toLowerCase().includes(q)
    );
  }

  if(ui.sortBy === "hanzi"){
    list.sort((a,b)=> (a.hanzi||"").localeCompare(b.hanzi||"zh", "zh-Hans"));
  }else if(ui.sortBy === "priority"){
    list.sort((a,b)=> new Date(a.srs?.due||0) - new Date(b.srs?.due||0));
  }else{
    list.sort((a,b)=> new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));
  }

  wordCount.textContent = list.length;
  wordTbody.innerHTML = list.map(w => {
    const due = humanDate(w.srs?.due);
    return `
      <tr>
        <td>${escapeHTML(w.hanzi)}</td>
        <td>${escapeHTML(w.pinyin||"")}</td>
        <td>${escapeHTML(w.meaning)}</td>
        <td>${escapeHTML(w.pos||"")}</td>
        <td>${escapeHTML(w.chapter||"")}</td>
        <td>${due}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-action="edit" data-id="${w.id}">수정</button>
            <button class="btn danger" data-action="del" data-id="${w.id}">삭제</button>
            <button class="btn" data-action="due-today" data-id="${w.id}">오늘복습</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  refreshChapterFilterOptions();
}

// ====== CRUD ======
function upsertWord(payload){
  const id = payload.id || crypto.randomUUID();
  const exists = words.find(w => w.id === id);
  if(exists){
    Object.assign(exists, payload, {updatedAt: nowISO()});
  }else{
    words.push({
      id,
      hanzi: payload.hanzi,
      pinyin: payload.pinyin || "",
      meaning: payload.meaning,
      pos: payload.pos || "",
      example: payload.example || "",
      chapter: payload.chapter || "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0 }
    });
  }
  save(); renderTable();
}

function deleteWord(id){
  words = words.filter(w => w.id !== id);
  save(); renderTable();
}

function loadToForm(id){
  const w = words.find(x=>x.id===id);
  if(!w) return;
  wordId.value = w.id;
  hanzi.value = w.hanzi;
  pinyin.value = w.pinyin || "";
  meaning.value = w.meaning;
  pos.value = w.pos || "";
  example.value = w.example || "";
  chapter.value = w.chapter || "";
  hanzi.focus();
}

function resetForm(){
  wordId.value = "";
  wordForm.reset();
  pos.value = "";
}

// ====== 이벤트 ======
wordForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  if(!hanzi.value.trim() || !meaning.value.trim()){
    alert("한자와 뜻은 필수입니다.");
    return;
  }
  upsertWord({
    id: wordId.value || undefined,
    hanzi: hanzi.value.trim(),
    pinyin: pinyin.value.trim(),
    meaning: meaning.value.trim(),
    pos: pos.value,
    example: example.value.trim(),
    chapter: chapter.value.trim()
  });
  resetForm();
});

resetBtn.addEventListener("click", (e)=>{
  e.preventDefault();
  resetForm();
});

search.addEventListener("input", ()=>{ ui.search = search.value; renderTable(); });
filterPos.addEventListener("change", ()=>{ ui.filterPos = filterPos.value; renderTable(); });
filterChapter.addEventListener("change", ()=>{ ui.filterChapter = filterChapter.value; renderTable(); });
sortBy.addEventListener("change", ()=>{ ui.sortBy = sortBy.value; renderTable(); });

wordTbody.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-action]");
  if(!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.action;
  if(act === "edit") loadToForm(id);
  else if(act === "del"){
    if(confirm("정말 삭제할까요?")) deleteWord(id);
  }else if(act === "due-today"){
    const w = words.find(x=>x.id===id);
    if(w){
      w.srs.due = nowISO();
      save(); renderTable();
    }
  }
});

// ====== 내보내기/가져오기 ======
exportJsonBtn.addEventListener("click", ()=>{
  const payload = JSON.stringify({ exportAt: nowISO(), words }, null, 2);
  download("vocab_export.json", payload);
});

exportCsvBtn.addEventListener("click", ()=>{
  const header = ["id","hanzi","pinyin","meaning","pos","example","chapter","createdAt","updatedAt","interval","ease","due","reps"].join(",");
  const lines = words.map(w =>
    [
      w.id, w.hanzi, w.pinyin, w.meaning, w.pos, w.example, w.chapter,
      w.createdAt, w.updatedAt, w.srs?.interval ?? 0, w.srs?.ease ?? 2.5,
      w.srs?.due ?? "", w.srs?.reps ?? 0
    ].map(csvEscape).join(",")
  );
  download("vocab_export.csv", [header, ...lines].join("\n"));
});

importBtn.addEventListener("click", ()=> importFile.click());
importFile.addEventListener("change", ()=>{
  const file = importFile.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=> {
    try{
      if(file.name.toLowerCase().endsWith(".json")){
        const data = JSON.parse(reader.result);
        if(Array.isArray(data.words)) {
          words = mergeWords(words, data.words);
        }else if(Array.isArray(data)) {
          words = mergeWords(words, data);
        }else{
          alert("JSON 형식이 올바르지 않습니다.");
          return;
        }
      }else{
        // CSV
        const rows = parseCSV(reader.result);
        const mapped = rows.map(r => ({
          id: r.id || crypto.randomUUID(),
          hanzi: r.hanzi || "",
          pinyin: r.pinyin || "",
          meaning: r.meaning || "",
          pos: r.pos || "",
          example: r.example || "",
          chapter: r.chapter || "",
          createdAt: r.createdAt || nowISO(),
          updatedAt: r.updatedAt || nowISO(),
          srs: {
            interval: Number(r.interval||0),
            ease: Number(r.ease||2.5),
            due: r.due || nowISO(),
            reps: Number(r.reps||0)
          }
        })).filter(x=>x.hanzi && x.meaning);
        words = mergeWords(words, mapped);
      }
      save(); renderTable();
      alert("가져오기가 완료되었습니다.");
    }catch(err){
      console.error(err);
      alert("가져오기 중 오류가 발생했습니다.");
    }finally{
      importFile.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
});

function mergeWords(base, incoming){
  const map = new Map(base.map(w=>[w.id,w]));
  for(const w of incoming){
    const withDefaults = {
      srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0, ...(w.srs||{}) },
      chapter: w.chapter ?? "",
      ...w
    };
    if(map.has(withDefaults.id)){
      const cur = map.get(withDefaults.id);
      if(new Date(withDefaults.updatedAt||0) > new Date(cur.updatedAt||0)){
        map.set(withDefaults.id, withDefaults);
      }
    }else{
      map.set(withDefaults.id, withDefaults);
    }
  }
  return Array.from(map.values());
}

function parseCSV(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
  const header = lines.shift().split(",").map(h=>h.trim());
  const rows = [];
  for(const line of lines){
    const cols = [];
    let cur = "", inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"' ){
        if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        cols.push(cur); cur="";
      }else cur += ch;
    }
    cols.push(cur);
    const obj = {};
    header.forEach((h,idx)=> obj[h]=cols[idx]);
    rows.push(obj);
  }
  return rows;
}

clearAllBtn.addEventListener("click", ()=>{
  if(confirm("모든 단어를 삭제할까요? 이 작업은 되돌릴 수 없습니다.")){
    words = []; save(); renderTable();
  }
});

// ====== 플래시카드 ======
let deck = [];
let deckIndex = 0;
let showBack = false;

function buildDeck(){
  const today = new Date();
  const q = ui.search.trim().toLowerCase();

  deck = words.filter(w=>{
    if(ui.filterPos && (w.pos||"") !== ui.filterPos) return false;
    if(ui.filterChapter && (w.chapter||"") !== ui.filterChapter) return false;
    if(q && !((w.hanzi||"").toLowerCase().includes(q) || (w.pinyin||"").toLowerCase().includes(q) || (w.meaning||"").toLowerCase().includes(q))) return false;
    if(dueOnly.checked){
      return new Date(w.srs?.due || 0) <= today;
    }
    return true;
  });

  deck.sort((a,b)=> new Date(a.srs?.due||0) - new Date(b.srs?.due||0));
  deckIndex = 0; showBack = false;
  flashTotal.textContent = deck.length;
  flashIndex.textContent = deck.length ? 1 : 0;
  renderFlash(true);
}

function currentCard(){
  return deck[deckIndex];
}

function renderFlash(isNewCard=false){
  const card = currentCard();
  if(!card){
    flashFront.textContent = "학습할 카드가 없습니다.";
    flashPinyin.textContent = "—";
    flashMeaning.textContent = "—";
    flashExample.textContent = "—";
    return;
  }

  // 방향에 따라 앞/뒤 내용 구성
  if(ui.cardDirection === "hanziToMeaning"){
    // 앞: 한자, 뒤: 병음/뜻/예문
    flashFront.textContent = card.hanzi || "—";
    flashPinyin.textContent = card.pinyin || "—";
    flashMeaning.textContent = card.meaning || "—";
    flashExample.textContent = card.example || "—";
  }else{
    // 뜻 -> 한자[병음]
    flashFront.textContent = card.meaning || "—";
    flashPinyin.textContent = card.pinyin || "—";
    flashMeaning.textContent = card.hanzi || "—"; // 뒤쪽 meaning 영역에 '정답: 한자' 배치
    flashExample.textContent = card.example || "—";
  }

  flashcard.classList.toggle("flipped", showBack);
  flashIndex.textContent = deckIndex + 1;

  // 자동 발음 (앞면 노출 시)
  if(isNewCard && ui.autoSpeak){
    speakCardFront(card);
  }
}

function nextCard(){
  if(deck.length === 0) return;
  deckIndex = (deckIndex + 1) % deck.length;
  showBack = false; renderFlash(true);
}
function prevCard(){
  if(deck.length === 0) return;
  deckIndex = (deckIndex - 1 + deck.length) % deck.length;
  showBack = false; renderFlash(true);
}
function flipCard(){
  showBack = !showBack; renderFlash();
  // 뒤집을 때 자동발음: 뒤에서 한자/병음을 들려주면 학습 도움
  if(ui.autoSpeak && showBack){
    const card = currentCard();
    if(card) speakHanzi(card);
  }
}

// ====== TTS (중국어) ======
let zhVoice = null;
function pickZhVoice(){
  // 언어 코드 zh-CN / zh_TW / zh 등 우선
  const voices = window.speechSynthesis.getVoices();
  if(!voices || voices.length===0) return null;
  const exact = voices.find(v => /zh(-|_)?CN/i.test(v.lang));
  if(exact) return exact;
  const anyZh = voices.find(v => /^zh/i.test(v.lang));
  return anyZh || null;
}

function speak(text, lang="zh-CN"){
  if(!supportsTTS) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  zhVoice = zhVoice || pickZhVoice();
  if(zhVoice) u.voice = zhVoice;
  u.rate = 1; // 속도 기본
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function speakHanzi(card){
  const content = (card.hanzi || card.pinyin || "").trim();
  if(!content) return;
  speak(content, "zh-CN");
}

function speakCardFront(card){
  if(ui.cardDirection === "hanziToMeaning"){
    speakHanzi(card);
  }else{
    // 뜻을 앞면으로 선택한 경우 앞면은 한국어이므로 스킵, 뒤집고 한자 재생하는 편
    // 필요하면 여기에서 한국어(TTS)가 가능하지만 브라우저·음성 차이로 생략
  }
}

// ====== 모달/이벤트 ======
openFlashcardBtn.addEventListener("click", ()=>{
  flashcardModal.classList.remove("hidden");
  buildDeck();
  flashcard.focus();
  if(!supportsTTS){ ttsNote.hidden = false; } else { ttsNote.hidden = true; }
});
closeFlashBtn.addEventListener("click", ()=>{ flashcardModal.classList.add("hidden"); });

prevCardBtn.addEventListener("click", prevCard);
nextCardBtn.addEventListener("click", nextCard);
flipCardBtn.addEventListener("click", flipCard);
flashcard.addEventListener("click", flipCard);
document.addEventListener("keydown", (e)=>{
  if(flashcardModal.classList.contains("hidden")) return;
  if(e.code === "Space"){ e.preventDefault(); flipCard(); }
  else if(e.key === "ArrowRight") nextCard();
  else if(e.key === "ArrowLeft") prevCard();
});

cardDirection.addEventListener("change", ()=>{
  ui.cardDirection = cardDirection.value;
  showBack = false;
  renderFlash(true);
});
speakBtn.addEventListener("click", ()=>{
  const card = currentCard();
  if(card) {
    // 앞면이 뜻일 때는 뒤집지 않고도 한자 발음 재생
    speakHanzi(card);
  }
});
autoSpeak.addEventListener("change", ()=>{ ui.autoSpeak = autoSpeak.checked; });

gradeAgain.addEventListener("click", ()=> gradeCard("again"));
gradeGood.addEventListener("click", ()=> gradeCard("good"));
gradeEasy.addEventListener("click", ()=> gradeCard("easy"));
dueOnly.addEventListener("change", buildDeck);

// ====== SRS ======
function gradeCard(grade){
  const card = currentCard();
  if(!card) return;
  const srs = card.srs || (card.srs = {interval:0, ease:2.5, due:nowISO(), reps:0});
  const today = new Date();
  srs.reps = (srs.reps || 0) + 1;

  if(grade === "again"){
    srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.2);
    srs.interval = 0;
    srs.due = today.toISOString();
  }else if(grade === "good"){
    srs.ease = Math.min(2.8, (srs.ease || 2.5) + 0.02);
    srs.interval = srs.interval ? Math.round(srs.interval * srs.ease) : 1;
    const due = new Date(today); due.setDate(due.getDate() + srs.interval);
    srs.due = due.toISOString();
  }else if(grade === "easy"){
    srs.ease = Math.min(3.0, (srs.ease || 2.5) + 0.1);
    srs.interval = srs.interval ? Math.round(srs.interval * srs.ease * 1.2) : 3;
    const due = new Date(today); due.setDate(due.getDate() + srs.interval);
    srs.due = due.toISOString();
  }
  card.updatedAt = nowISO();
  save();
  nextCard();
}

// ====== 테마 ======
toggleThemeBtn.addEventListener("click", ()=>{
  setTheme(ui.theme === "dark" ? "light" : "dark");
  toggleThemeBtn.textContent = ui.theme === "dark" ? "다크모드" : "라이트모드";
});

// ====== 초기화 ======
(function init(){
  // 테마
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  setTheme(savedTheme);
  toggleThemeBtn.textContent = savedTheme === "dark" ? "라이트모드" : "다크모드";

  // 데이터
  load();

  // 데모 예시(처음 빈 경우)
  if(words.length === 0){
    upsertWord({hanzi:"学习", pinyin:"xuéxí", meaning:"공부하다", pos:"동사", example:"我每天学习中文。", chapter:"3과"});
    upsertWord({hanzi:"咖啡", pinyin:"kāfēi", meaning:"커피", pos:"명사", example:"咖啡很好喝。", chapter:"4과"});
  }

  // UI 초기값 동기화
  cardDirection.value = ui.cardDirection;
  autoSpeak.checked = ui.autoSpeak;

  renderTable();
})();}

function setTheme(mode){
  const root = document.documentElement;
  root.setAttribute("data-theme", mode === "light" ? "light" : "dark");
  localStorage.setItem(THEME_KEY, mode);
  ui.theme = mode;
}

function humanDate(iso){
  if(!iso) return "—";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function download(filename, text){
  const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s){
  if(s == null) return "";
  const str = String(s);
  if(/[",\n]/.test(str)) return `"${str.replace(/"/g,'""')}"`;
  return str;
}

// ====== DOM 참조 ======
const wordForm = $("#wordForm");
const wordId = $("#wordId");
const hanzi = $("#hanzi");
const pinyin = $("#pinyin");
const meaning = $("#meaning");
const pos = $("#pos");
const example = $("#example");
const resetBtn = $("#resetBtn");
const saveBtn = $("#saveBtn");

const search = $("#search");
const filterPos = $("#filterPos");
const sortBy = $("#sortBy");
const exportJsonBtn = $("#exportJsonBtn");
const exportCsvBtn = $("#exportCsvBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
const clearAllBtn = $("#clearAllBtn");
const wordCount = $("#wordCount");
const wordTbody = $("#wordTbody");
const toggleThemeBtn = $("#toggleThemeBtn");

const openFlashcardBtn = $("#openFlashcardBtn");
const flashcardModal = $("#flashcardModal");
const closeFlashBtn = $("#closeFlashBtn");
const flashcard = $("#flashcard");
const flashFront = $("#flashFront");
const flashBack = $("#flashBack");
const flashPinyin = $("#flashPinyin");
const flashMeaning = $("#flashMeaning");
const flashExample = $("#flashExample");
const flashIndex = $("#flashIndex");
const flashTotal = $("#flashTotal");
const prevCardBtn = $("#prevCardBtn");
const nextCardBtn = $("#nextCardBtn");
const flipCardBtn = $("#flipCardBtn");
const gradeAgain = $("#gradeAgain");
const gradeGood = $("#gradeGood");
const gradeEasy = $("#gradeEasy");
const dueOnly = $("#dueOnly");

// ====== 렌더링 ======
function renderTable(){
  const q = ui.search.trim().toLowerCase();
  let list = words.slice();

  if(ui.filterPos) list = list.filter(w => (w.pos || "") === ui.filterPos);
  if(q){
    list = list.filter(w =>
      (w.hanzi||"").toLowerCase().includes(q) ||
      (w.pinyin||"").toLowerCase().includes(q) ||
      (w.meaning||"").toLowerCase().includes(q)
    );
  }

  if(ui.sortBy === "hanzi"){
    list.sort((a,b)=> (a.hanzi||"").localeCompare(b.hanzi||"zh", "zh-Hans"));
  }else if(ui.sortBy === "priority"){
    // due 빠른 순 → 학습 우선
    list.sort((a,b)=> new Date(a.srs?.due||0) - new Date(b.srs?.due||0));
  }else{
    // recent
    list.sort((a,b)=> new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt));
  }

  wordCount.textContent = list.length;
  wordTbody.innerHTML = list.map(w => {
    const due = humanDate(w.srs?.due);
    return `
      <tr>
        <td>${escapeHTML(w.hanzi)}</td>
        <td>${escapeHTML(w.pinyin||"")}</td>
        <td>${escapeHTML(w.meaning)}</td>
        <td>${escapeHTML(w.pos||"")}</td>
        <td>${due}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-action="edit" data-id="${w.id}">수정</button>
            <button class="btn danger" data-action="del" data-id="${w.id}">삭제</button>
            <button class="btn" data-action="due-today" data-id="${w.id}">오늘복습</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function escapeHTML(str){
  return (str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

// ====== CRUD ======
function upsertWord(payload){
  const id = payload.id || crypto.randomUUID();
  const exists = words.find(w => w.id === id);
  if(exists){
    Object.assign(exists, payload, {updatedAt: nowISO()});
  }else{
    words.push({
      id,
      hanzi: payload.hanzi,
      pinyin: payload.pinyin || "",
      meaning: payload.meaning,
      pos: payload.pos || "",
      example: payload.example || "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0 }
    });
  }
  save(); renderTable();
}

function deleteWord(id){
  words = words.filter(w => w.id !== id);
  save(); renderTable();
}

function loadToForm(id){
  const w = words.find(x=>x.id===id);
  if(!w) return;
  wordId.value = w.id;
  hanzi.value = w.hanzi;
  pinyin.value = w.pinyin || "";
  meaning.value = w.meaning;
  pos.value = w.pos || "";
  example.value = w.example || "";
  hanzi.focus();
}

function resetForm(){
  wordId.value = "";
  wordForm.reset();
  pos.value = "";
}

// ====== 이벤트 ======
wordForm.addEventListener("submit", (e)=>{
  e.preventDefault();
  if(!hanzi.value.trim() || !meaning.value.trim()){
    alert("한자와 뜻은 필수입니다.");
    return;
  }
  upsertWord({
    id: wordId.value || undefined,
    hanzi: hanzi.value.trim(),
    pinyin: pinyin.value.trim(),
    meaning: meaning.value.trim(),
    pos: pos.value,
    example: example.value.trim()
  });
  resetForm();
});

resetBtn.addEventListener("click", (e)=>{
  e.preventDefault();
  resetForm();
});

search.addEventListener("input", ()=>{ ui.search = search.value; renderTable(); });
filterPos.addEventListener("change", ()=>{ ui.filterPos = filterPos.value; renderTable(); });
sortBy.addEventListener("change", ()=>{ ui.sortBy = sortBy.value; renderTable(); });

wordTbody.addEventListener("click", (e)=>{
  const btn = e.target.closest("button[data-action]");
  if(!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.action;
  if(act === "edit") loadToForm(id);
  else if(act === "del"){
    if(confirm("정말 삭제할까요?")) deleteWord(id);
  }else if(act === "due-today"){
    const w = words.find(x=>x.id===id);
    if(w){
      w.srs.due = nowISO();
      save(); renderTable();
    }
  }
});

// ====== 내보내기/가져오기 ======
exportJsonBtn.addEventListener("click", ()=>{
  const payload = JSON.stringify({ exportAt: nowISO(), words }, null, 2);
  download("vocab_export.json", payload);
});

exportCsvBtn.addEventListener("click", ()=>{
  const header = ["id","hanzi","pinyin","meaning","pos","example","createdAt","updatedAt","interval","ease","due","reps"].join(",");
  const lines = words.map(w =>
    [
      w.id, w.hanzi, w.pinyin, w.meaning, w.pos, w.example,
      w.createdAt, w.updatedAt, w.srs?.interval ?? 0, w.srs?.ease ?? 2.5,
      w.srs?.due ?? "", w.srs?.reps ?? 0
    ].map(csvEscape).join(",")
  );
  download("vocab_export.csv", [header, ...lines].join("\n"));
});

importBtn.addEventListener("click", ()=> importFile.click());
importFile.addEventListener("change", ()=>{
  const file = importFile.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=> {
    try{
      if(file.name.toLowerCase().endsWith(".json")){
        const data = JSON.parse(reader.result);
        if(Array.isArray(data.words)) {
          words = mergeWords(words, data.words);
        }else if(Array.isArray(data)) {
          words = mergeWords(words, data);
        }else{
          alert("JSON 형식이 올바르지 않습니다.");
          return;
        }
      }else{
        // CSV
        const rows = parseCSV(reader.result);
        const mapped = rows.map(r => ({
          id: r.id || crypto.randomUUID(),
          hanzi: r.hanzi || "",
          pinyin: r.pinyin || "",
          meaning: r.meaning || "",
          pos: r.pos || "",
          example: r.example || "",
          createdAt: r.createdAt || nowISO(),
          updatedAt: r.updatedAt || nowISO(),
          srs: {
            interval: Number(r.interval||0),
            ease: Number(r.ease||2.5),
            due: r.due || nowISO(),
            reps: Number(r.reps||0)
          }
        })).filter(x=>x.hanzi && x.meaning);
        words = mergeWords(words, mapped);
      }
      save(); renderTable();
      alert("가져오기가 완료되었습니다.");
    }catch(err){
      console.error(err);
      alert("가져오기 중 오류가 발생했습니다.");
    }finally{
      importFile.value = "";
    }
  };
  reader.readAsText(file, "utf-8");
});

function mergeWords(base, incoming){
  const map = new Map(base.map(w=>[w.id,w]));
  for(const w of incoming){
    if(map.has(w.id)){
      // 업데이트가 더 최신이면 덮어쓰기
      const cur = map.get(w.id);
      if(new Date(w.updatedAt||0) > new Date(cur.updatedAt||0)){
        map.set(w.id, w);
      }
    }else{
      map.set(w.id, w);
    }
  }
  return Array.from(map.values());
}

function parseCSV(text){
  // 매우 단순 CSV 파서 (따옴표 처리)
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
  const header = lines.shift().split(",").map(h=>h.trim());
  const rows = [];
  for(const line of lines){
    const cols = [];
    let cur = "", inQ = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(ch === '"' ){
        if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if(ch === "," && !inQ){
        cols.push(cur); cur="";
      }else cur += ch;
    }
    cols.push(cur);
    const obj = {};
    header.forEach((h,idx)=> obj[h]=cols[idx]);
    rows.push(obj);
  }
  return rows;
}

clearAllBtn.addEventListener("click", ()=>{
  if(confirm("모든 단어를 삭제할까요? 이 작업은 되돌릴 수 없습니다.")){
    words = []; save(); renderTable();
  }
});

// ====== 플래시카드 ======
let deck = [];
let deckIndex = 0;
let showBack = false;

function buildDeck(){
  const today = new Date();
  const q = ui.search.trim().toLowerCase();

  deck = words.filter(w=>{
    if(ui.filterPos && (w.pos||"") !== ui.filterPos) return false;
    if(q && !((w.hanzi||"").toLowerCase().includes(q) || (w.pinyin||"").toLowerCase().includes(q) || (w.meaning||"").toLowerCase().includes(q))) return false;
    if(dueOnly.checked){
      return new Date(w.srs?.due || 0) <= today;
    }
    return true;
  });

  // 우선순위: 기한 지난 순
  deck.sort((a,b)=> new Date(a.srs?.due||0) - new Date(b.srs?.due||0));
  deckIndex = 0;
  $("#flashTotal").textContent = deck.length;
  $("#flashIndex").textContent = deck.length ? 1 : 0;
  renderFlash();
}

function renderFlash(){
  const card = deck[deckIndex];
  if(!card){
    flashFront.textContent = "학습할 카드가 없습니다.";
    flashBack.querySelectorAll("*").forEach(el=> el.textContent="—");
    return;
  }
  flashFront.textContent = card.hanzi || "—";
  flashPinyin.textContent = card.pinyin || "—";
  flashMeaning.textContent = card.meaning || "—";
  flashExample.textContent = card.example || "—";
  flashcard.classList.toggle("flipped", showBack);
  flashIndex.textContent = deckIndex + 1;
}

function nextCard(){
  if(deck.length === 0) return;
  deckIndex = (deckIndex + 1) % deck.length;
  showBack = false; renderFlash();
}
function prevCard(){
  if(deck.length === 0) return;
  deckIndex = (deckIndex - 1 + deck.length) % deck.length;
  showBack = false; renderFlash();
}
function flipCard(){ showBack = !showBack; renderFlash(); }

function gradeCard(grade){
  const card = deck[deckIndex];
  if(!card) return;
  const srs = card.srs || (card.srs = {interval:0, ease:2.5, due:nowISO(), reps:0});
  // 간단한 SRS: ease 2.2~2.6, interval 0/1/3/7/...
  const today = new Date();
  srs.reps = (srs.reps || 0) + 1;

  if(grade === "again"){
    srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.2);
    srs.interval = 0;
    srs.due = today.toISOString(); // 곧 다시
  }else if(grade === "good"){
    srs.ease = Math.min(2.8, (srs.ease || 2.5) + 0.02);
    srs.interval = srs.interval ? Math.round(srs.interval * srs.ease) : 1;
    const due = new Date(today); due.setDate(due.getDate() + srs.interval);
    srs.due = due.toISOString();
  }else if(grade === "easy"){
    srs.ease = Math.min(3.0, (srs.ease || 2.5) + 0.1);
    srs.interval = srs.interval ? Math.round(srs.interval * srs.ease * 1.2) : 3;
    const due = new Date(today); due.setDate(due.getDate() + srs.interval);
    srs.due = due.toISOString();
  }
  card.updatedAt = nowISO();
  save();

  // 다음 카드로 이동
  nextCard();
}

openFlashcardBtn.addEventListener("click", ()=>{
  flashcardModal.classList.remove("hidden");
  buildDeck();
  flashcard.focus();
});

closeFlashBtn.addEventListener("click", ()=>{
  flashcardModal.classList.add("hidden");
});

prevCardBtn.addEventListener("click", prevCard);
nextCardBtn.addEventListener("click", nextCard);
flipCardBtn.addEventListener("click", flipCard);
flashcard.addEventListener("click", flipCard);
document.addEventListener("keydown", (e)=>{
  if(flashcardModal.classList.contains("hidden")) return;
  if(e.code === "Space"){ e.preventDefault(); flipCard(); }
  else if(e.key === "ArrowRight") nextCard();
  else if(e.key === "ArrowLeft") prevCard();
});
gradeAgain.addEventListener("click", ()=> gradeCard("again"));
gradeGood.addEventListener("click", ()=> gradeCard("good"));
gradeEasy.addEventListener("click", ()=> gradeCard("easy"));
dueOnly.addEventListener("change", buildDeck);

// ====== 테마 ======
toggleThemeBtn.addEventListener("click", ()=>{
  setTheme(ui.theme === "dark" ? "light" : "dark");
  toggleThemeBtn.textContent = ui.theme === "dark" ? "다크모드" : "라이트모드";
});

// ====== 초기화 ======
(function init(){
  // 테마
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  setTheme(savedTheme);
  toggleThemeBtn.textContent = savedTheme === "dark" ? "라이트모드" : "다크모드";

  // 데이터
  load();

  // 데모 예시(처음 빈 경우)
  if(words.length === 0){
    upsertWord({hanzi:"学习", pinyin:"xuéxí", meaning:"공부하다", pos:"동사", example:"我每天学习中文。"});
    upsertWord({hanzi:"咖啡", pinyin:"kāfēi", meaning:"커피", pos:"명사", example:"咖啡很好喝。"});
  }

  renderTable();
})();
