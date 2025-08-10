// ====== 설정 ======
const STORAGE_KEY = "cn_vocab_cards_v1";
const THEME_KEY = "cn_vocab_theme";
const nowISO = () => new Date().toISOString();

// ====== 상태 ======
let words = []; // [{id, hanzi, pinyin, meaning, pos, example, createdAt, updatedAt, srs:{interval, ease, due, reps}}]
let ui = {
  search: "",
  filterPos: "",
  sortBy: "recent",
  theme: "dark",
};

// ====== 유틸 ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ words }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data.words)) {
      // 마이그레이션 처리
      words = data.words.map(w => ({
        srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0 },
        ...w,
        srs: { interval: 0, ease: 2.5, due: nowISO(), reps: 0, ...(w.srs || {}) }
      }));
    }
  } catch {}
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
