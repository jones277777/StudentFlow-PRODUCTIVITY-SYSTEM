/* StudentFlow front-end: renders live data from the Flask API into the Figma layout. */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_LABEL = { pending: "Pending", in_progress: "In progress", review: "In review", completed: "Completed" };
const NEXT_STATUS = { pending: "in_progress", in_progress: "review", review: "completed", completed: "pending" };
const todayIdx = ((new Date().getDay() + 6) % 7) + 1; // Mon = 1 ... Sun = 7

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove("show"), 2600);
}

function daysLeft(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function dueText(days) {
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, "0")).join(":");
}

function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/* ---------- Schedule: timetable ---------- */
function classRow(c, current) {
  return `
    <div class="class-row ${current ? "current" : ""}">
      <div class="grow">
        <strong>${esc(c.name)}</strong>
        <small>${esc(c.room)}${c.instructor ? " • " + esc(c.instructor) : ""}</small>
      </div>
      <div class="when">
        <span class="time-pill">${esc(c.start_time)}</span>
        <small>${esc(c.end_time)}</small>
      </div>
    </div>`;
}

async function loadCourses() {
  const courses = await api("/api/courses");
  const today = courses.filter((c) => c.day_of_week === todayIdx);

  $("#hero-classes").innerHTML = today.slice(0, 2)
    .map((c, i) => classRow(c, i === 0)).join("")
    || `<p class="muted">No classes today.</p>`;

  $("#schedule-list").innerHTML = courses.slice(0, 5).map((c) => `
    <div class="sched-row">
      <div>
        <span class="day">${DAYS[c.day_of_week - 1]}</span>
        <b>${esc(c.name)}</b>
      </div>
      <span>${esc(c.start_time)}</span>
    </div>`).join("")
    || `<p class="muted">Add a class below to build your timetable.</p>`;
}

/* ---------- Schedule: syllabus progress ---------- */
async function loadSyllabus() {
  const rows = await api("/api/syllabus");
  $("#syllabus-list").innerHTML = rows.length ? rows.slice(0, 3).map((r) => {
    const pct = r.total ? Math.round((r.done * 100) / r.total) : 0;
    return `
      <div class="progress-item">
        <div class="row-between">
          <span>${esc(r.course_name)}</span>
          <b class="${pct >= 80 ? "ok" : ""}">${r.done}/${r.total} (${pct}%)</b>
        </div>
        <div class="track"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join("") : `<p class="muted">Add syllabus topics to track progress.</p>`;
}

/* ---------- Schedule: exams ---------- */
async function loadExams() {
  const exams = await api("/api/exams");
  $("#exam-list").innerHTML = exams.slice(0, 3).map((e) => {
    const d = daysLeft(e.exam_date);
    return `
      <div class="mini-card">
        <div>
          <small class="eyebrow red">${esc(e.title)}</small>
          <strong>${esc(e.course_name)}</strong>
        </div>
        <span class="chip ${d <= 7 ? "chip-red" : "chip-blue"}">${d === 0 ? "Today" : d + " Days Left"}</span>
      </div>`;
  }).join("") || `<p class="muted">No upcoming exams.</p>`;
}

/* ---------- Assignments ---------- */
let assignments = [];

async function loadAssignments() {
  assignments = await api("/api/assignments");
  const open = assignments.filter((a) => a.status !== "completed");

  // Hero urgent banner: nearest open deadline
  const urgent = open[0];
  $("#hero-urgent-title").textContent = urgent ? urgent.title : "Nothing urgent";
  $("#hero-urgent-sub").textContent = urgent ? (urgent.course_name || "No course set") : "You're all caught up.";
  const dueEl = $("#hero-urgent-due");
  dueEl.textContent = urgent ? dueText(daysLeft(urgent.deadline)) : "";
  dueEl.style.display = urgent ? "" : "none";

  // Card 1: assignment list
  $("#assign-list").innerHTML = open.slice(0, 2).map((a) => `
    <div class="assign-card">
      <div class="top">
        <span class="tag-course">${esc(a.course_name || "GENERAL")}</span>
        <span class="prio prio-${a.priority}">${esc(a.priority)}</span>
      </div>
      <strong>${esc(a.title)}</strong>
      <small>Due ${esc(a.deadline)}</small>
    </div>`).join("")
    || `<p class="muted">No open assignments. Add one below.</p>`;

  // Card 2: deadline tracker
  $("#deadline-list").innerHTML = open.slice(0, 3).map((a) => {
    const d = daysLeft(a.deadline);
    return `
      <div class="deadline-item">
        <div>
          <strong>${esc(a.title)}</strong>
          <small>${esc(a.course_name || "General")}</small>
        </div>
        <span class="due ${d <= 2 ? "urgent-due" : ""}">${dueText(d)}</span>
      </div>`;
  }).join("") || `<p class="muted">No deadlines coming up.</p>`;

  // Card 3: task board (click to advance status)
  $("#board").innerHTML = assignments.slice(0, 5).map((a) => `
    <button class="board-item st-${a.status}" type="button" data-advance="${a.id}" data-status="${a.status}">
      <strong>${esc(a.title)}</strong>
      <small>${STATUS_LABEL[a.status]}</small>
    </button>`).join("")
    || `<p class="muted">Your task board is empty.</p>`;
}

async function advanceAssignment(id) {
  const a = assignments.find((x) => x.id === id);
  if (!a) return;
  await api(`/api/assignments/${id}`, { method: "PATCH", body: { status: NEXT_STATUS[a.status] } });
  await loadAssignments();
}

/* ---------- Study monitor ---------- */
const timer = { running: false, startedAt: 0, base: 0 };

const elapsed = () => timer.base + (timer.running ? (Date.now() - timer.startedAt) / 1000 : 0);

function renderTimer() {
  const text = fmtHMS(elapsed());
  document.querySelectorAll("[data-timer]").forEach((el) => (el.textContent = text));
  const toggle = $("#timer-toggle");
  toggle.textContent = timer.running ? "Pause" : timer.base ? "Resume" : "Start";
  $("#hero-pause-label").textContent = timer.running ? "Pause Study Session" : "Resume Study Session";
}

function toggleTimer() {
  if (timer.running) {
    timer.base = elapsed();
    timer.running = false;
  } else {
    timer.startedAt = Date.now();
    timer.running = true;
  }
  renderTimer();
}

async function stopTimer() {
  const seconds = Math.floor(elapsed());
  timer.running = false;
  timer.base = 0;
  renderTimer();
  if (seconds < 1) return;
  try {
    const subject = $("#timer-subject").value.trim() || "General Study";
    await api("/api/study/sessions", { method: "POST", body: { subject, duration_seconds: seconds } });
    toast(`Saved ${fmtDuration(seconds)} of study`);
    await loadStudy();
  } catch (err) {
    toast(err.message);
  }
}

async function loadStudy() {
  const s = await api("/api/study/summary");
  const max = Math.max(1, ...s.daily.map((d) => d.seconds));

  $("#today-total").textContent = fmtDuration(s.today);
  $("#hero-logged").textContent = fmtDuration(s.today);

  $("#week-bars").innerHTML = s.daily.map((d, i) => {
    const label = new Date(d.date + "T00:00:00").toLocaleDateString("en", { weekday: "short" }).charAt(0);
    const h = d.seconds ? Math.max(8, Math.round((d.seconds / max) * 100)) : 4;
    return `
      <div class="bar-col">
        <div class="bar-fill ${i === 6 ? "hi" : ""}" style="height:${h}%" title="${fmtDuration(d.seconds)}"></div>
        <small>${label}</small>
      </div>`;
  }).join("");

  $("#heatmap").innerHTML = s.daily.map((d) => {
    const opacity = d.seconds ? 0.25 + (d.seconds / max) * 0.75 : 0.1;
    return `<span style="opacity:${opacity.toFixed(2)}" title="${fmtDuration(d.seconds)}"></span>`;
  }).join("");
}

/* ---------- Load everything ---------- */
async function loadAll() {
  try {
    await Promise.all([loadCourses(), loadSyllabus(), loadExams(), loadAssignments(), loadStudy()]);
  } catch (err) {
    toast("Could not load data: " + err.message);
  }
}

/* ---------- Forms ---------- */
function bindForm(id, handler, message) {
  const form = document.getElementById(id);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)));
      form.reset();
      toast(message);
      await loadAll();
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
}

bindForm("form-course",
  (d) => api("/api/courses", { method: "POST", body: d }),
  "Class added to your timetable");

bindForm("form-assignment",
  (d) => api("/api/assignments", { method: "POST", body: d }),
  "Assignment saved");

bindForm("form-exam",
  (d) => api("/api/exams", { method: "POST", body: d }),
  "Exam scheduled");

bindForm("form-topic",
  (d) => api("/api/syllabus", { method: "POST", body: d }),
  "Syllabus topic saved");

bindForm("form-session",
  (d) => api("/api/study/sessions", {
    method: "POST",
    body: { subject: d.subject || "General Study", duration_seconds: Number(d.minutes) * 60 },
  }),
  "Study session logged");

/* ---------- Event wiring ---------- */
document.addEventListener("click", (e) => {
  const item = e.target.closest("[data-advance]");
  if (item) advanceAssignment(Number(item.dataset.advance)).catch((err) => toast(err.message));
});

$("#timer-toggle").addEventListener("click", toggleTimer);
$("#hero-pause").addEventListener("click", toggleTimer);
$("#timer-stop").addEventListener("click", stopTimer);

setInterval(() => { if (timer.running) renderTimer(); }, 1000);

renderTimer();
loadAll();
