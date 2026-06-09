const CATEGORIES = [
  "イベント",
  "貸切",
  "ふらっとハイよろ。",
  "空き",
  "村長不在",
  "受付終了",
];

const CATEGORY_ALIASES = [
  ["貸切", ["貸切", "貸し切り", "予約あり", "ビジネス利用", "スペース利用", "友達利用"]],
  ["イベント", ["イベント", "event", "大岩キッチン", "オーヤキッチン", "オヤキッチン", "おやキッチン", "oya kitchen", "oyakitchen", "応用キッチン", "お祝いキッチン", "キャッシュフローゲーム"]],
  ["ふらっとハイよろ。", ["ふらっとハイよろ。", "ふらっとハイよろ", "ふらっとハイヨロ", "フラットハイよろ", "フラットハイヨロ", "flatハイよろ", "flatハイヨロ", "flatok", "flat ok", "ふらっとok"]],
  ["村長不在", ["村長不在", "不在", "個人予定あり", "空きなし", "空いていない", "予約不可", "埋まっている"]],
  ["受付終了", ["受付終了", "受付外", "直前不可"]],
];
const PRIVATE_TITLE_ALIASES = ["大岩キッチン"];

const OPEN_DAY = 5;
const CLOSED_DAYS = new Set([0, 3]);
const RESERVATION_DEADLINE_DAYS = 3;
const DISPLAY_START_HOUR = 10;
const DISPLAY_END_HOUR = 24;
const NIGHT_START_HOUR = 19;
const HOUR_HEIGHT = 64;
const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
const MANAGEMENT_LABEL_PATTERN = /^\s*(?:【(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)】|［(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)］|\[(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\]|「(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)」|（(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)）|\((?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\))\s*/;
const MANAGEMENT_INLINE_LABEL_PATTERN = /\s*(?:【(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)】|［(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)］|\[(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\]|「(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)」|（(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)）|\((?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\))\s*/g;
const EVENT_MARKER_PATTERN = /(?:【|［|\[|「|（|\()\s*イベント\s*(?:】|］|\]|」|）|\))/i;
const PRIVATE_MARKER_PATTERN = /(?:【|［|\[|「|（|\()\s*(?:貸切|ビジネス利用|スペース利用|友達利用)\s*(?:】|］|\]|」|）|\))/i;

const state = {
  viewDate: new Date(),
  selectedDate: new Date(),
  events: [],
  activeCategories: new Set(CATEGORIES),
  apiUrl: new URLSearchParams(location.search).get("api") || window.HAIYORO_API_URL || "",
};

const els = {
  dataSource: document.querySelector("#dataSource"),
  syncButton: document.querySelector("#syncButton"),
  prevWeek: document.querySelector("#prevWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  todayButton: document.querySelector("#todayButton"),
  weekLabel: document.querySelector("#weekLabel"),
  weekHighlights: document.querySelector("#weekHighlights"),
  weekHighlightsRange: document.querySelector("#weekHighlightsRange"),
  weekHeaders: document.querySelector("#weekHeaders"),
  timeRail: document.querySelector("#timeRail"),
  weekGrid: document.querySelector("#weekGrid"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  selectedEvents: document.querySelector("#selectedEvents"),
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const base = startOfDay(date);
  const mondayOffset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - mondayOffset);
  return base;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${DAY_NAMES[date.getDay()]}）`;
}

function formatWeek(date) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日-${end.getDate()}日`;
  }
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
}

function formatTime(dateLike) {
  const date = new Date(dateLike);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimeInDay(dateLike, day) {
  const date = new Date(dateLike);
  const nextDay = addDays(startOfDay(day), 1);
  if (date.getTime() === nextDay.getTime()) return "24:00";
  return formatTime(date);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function displayTitle(value) {
  return String(value || "")
    .replace(MANAGEMENT_LABEL_PATTERN, "")
    .replace(MANAGEMENT_INLINE_LABEL_PATTERN, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isPersonalBlockedEvent(event) {
  return ["村長不在", "空きなし", "空いていない"].includes(event.category);
}

function isUsageOverrideEvent(event) {
  if (event.usageOverride) return true;
  if (event.sourceCalendar === "primary" && event.category === "貸切") return true;
  const text = `${event.category || ""} ${event.title || ""} ${event.description || ""} ${event.memo || ""}`;
  return text.includes("ビジネス利用") || text.includes("スペース利用") || text.includes("友達利用");
}

function primaryEventOverlapsNight(event) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  let day = startOfDay(start);
  while (day < end) {
    if (end > nightStart(day) && start < dayDisplayEnd(day)) return true;
    day = addDays(day, 1);
  }
  return false;
}

function detectCategory(event) {
  const rawText = `${event.category || ""} ${event.title || ""} ${event.description || ""}`;
  if (EVENT_MARKER_PATTERN.test(rawText)) return "イベント";
  if (PRIVATE_MARKER_PATTERN.test(rawText)) return "貸切";
  const cleanedTitle = normalizeText(displayTitle(event.title || ""));
  if (PRIVATE_TITLE_ALIASES.some((alias) => cleanedTitle === normalizeText(alias))) return "貸切";
  const text = normalizeText(rawText);
  if (["ビジネス利用", "スペース利用", "友達利用"].some((label) => text.includes(normalizeText(label)))) return "貸切";
  for (const [category, aliases] of CATEGORY_ALIASES) {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) return category;
  }
  return event.category && CATEGORIES.includes(event.category) ? event.category : "";
}

function extractParticipants(event) {
  if (Array.isArray(event.participants) && event.participants.length) return event.participants;
  const source = `${event.title || ""}\n${event.description || ""}`;
  const match = source.match(/(?:参加者|参加|来る人|村人)[:：]\s*([^\n]+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,\/／]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function sanitizeEvent(raw) {
  const category = detectCategory(raw);
  const isKnown = Boolean(category);
  const isHaiyoroCalendarEvent = raw.sourceCalendar && raw.sourceCalendar !== "primary";
  const usageOverride = isUsageOverrideEvent(raw);
  const isPrimaryCalendarEvent = raw.sourceCalendar === "primary";
  const isPrimaryBusy = isPrimaryCalendarEvent && primaryEventOverlapsNight(raw) && !usageOverride;
  if (isPrimaryBusy) {
    return {
      id: raw.id || `${raw.title}-${raw.start}`,
      title: "村長不在",
      category: "村長不在",
      start: raw.start,
      end: raw.end,
      allDay: Boolean(raw.allDay),
      participants: [],
      description: "個人予定あり",
      location: "",
      usageOverride: false,
    };
  }
  if (isPrimaryCalendarEvent && !usageOverride) return null;
  const displayCategory = isKnown ? category : isHaiyoroCalendarEvent ? "イベント" : "村長不在";
  const shouldReveal = isKnown || isHaiyoroCalendarEvent;
  return {
    id: raw.id || `${raw.title}-${raw.start}`,
    title: shouldReveal ? displayTitle(raw.title) || displayCategory : "村長不在",
    category: displayCategory,
    start: raw.start,
    end: raw.end,
    allDay: Boolean(raw.allDay),
    participants: shouldReveal ? extractParticipants(raw) : [],
    description: shouldReveal ? raw.description || raw.memo || "" : "個人予定あり",
    location: shouldReveal ? raw.location || "" : "",
    usageOverride,
  };
}

function sampleEvents(weekStart) {
  const eventAt = (dayIndex, hour, minute = 0) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex, hour, minute);
  return [
    {
      title: "イベント｜朝の会",
      category: "イベント",
      start: eventAt(1, 10),
      end: eventAt(1, 13),
      description: "10時開始の予定例",
    },
    {
      title: "ふらっとハイよろ。｜2軒目利用",
      category: "ふらっとハイよろ。",
      start: eventAt(5, 20),
      end: eventAt(5, 23),
      description: "事前連絡あり",
    },
    {
      title: "社外予定",
      start: eventAt(3, 20),
      end: eventAt(3, 22),
      description: "カテゴリなしの予定は村人向けには予定名を出しません",
    },
    {
      title: "キャッシュフローゲーム",
      category: "イベント",
      start: eventAt(5, 10),
      end: eventAt(5, 13),
      participants: ["6名"],
    },
    {
      title: "【ビジネス利用】大岩キッチン",
      start: eventAt(4, 19),
      end: eventAt(4, 22),
      description: "ハイよろ専用カレンダーの予定例",
    },
    {
      title: "貸切｜ブラビト",
      category: "貸切",
      start: eventAt(6, 19),
      end: eventAt(6, 23),
      participants: ["ブラビト"],
    },
  ].map(sanitizeEvent).filter(Boolean);
}

function normalizeEvents(events) {
  return events.map(sanitizeEvent).filter(Boolean);
}

function weekRange() {
  const start = startOfWeek(state.viewDate);
  const end = addDays(start, 7);
  return { start, end };
}

function toIso(date) {
  return date.toISOString();
}

function fetchJsonp(url, params) {
  return new Promise((resolve, reject) => {
    const callback = `haiyoroCallback_${Date.now()}_${Math.round(Math.random() * 10000)}`;
    const script = document.createElement("script");
    const nextUrl = new URL(url);
    Object.entries({ ...params, callback }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") nextUrl.searchParams.set(key, value);
    });

    const cleanup = () => {
      delete window[callback];
      script.remove();
    };

    window[callback] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Calendar endpoint failed"));
    };

    script.src = nextUrl.toString();
    document.head.appendChild(script);
  });
}

async function loadEvents() {
  const { start, end } = weekRange();
  els.dataSource.textContent = state.apiUrl ? "Googleカレンダー更新中…" : "更新中…";
  if (!state.apiUrl) {
    state.events = sampleEvents(start);
    els.dataSource.textContent = "サンプル表示";
    render();
    return;
  }

  try {
    const payload = await fetchJsonp(state.apiUrl, {
      start: toIso(start),
      end: toIso(end),
    });
    state.events = normalizeEvents(payload.events || []);
    els.dataSource.textContent = `Googleカレンダー 最終更新 ${formatTime(new Date())}`;
  } catch (error) {
    state.events = sampleEvents(start);
    els.dataSource.textContent = "接続エラー（サンプル表示）";
  }
  render();
}

function dayDisplayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), DISPLAY_START_HOUR, 0, 0);
}

function dayDisplayEnd(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), DISPLAY_END_HOUR, 0, 0);
}

function nightStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), NIGHT_START_HOUR, 0, 0);
}

function overlapsRange(event, start, end) {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end || event.start);
  return eventStart < end && eventEnd > start;
}

function eventsForDate(date) {
  return state.events
    .filter((event) => overlapsRange(event, dayDisplayStart(date), dayDisplayEnd(date)))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function hasNightEvent(date) {
  return eventsForDate(date).some((event) => event.allDay || overlapsRange(event, nightStart(date), dayDisplayEnd(date)));
}

function daysUntil(date) {
  const diff = startOfDay(date) - startOfDay(new Date());
  return Math.round(diff / 86400000);
}

function statusForOpenSlot(date) {
  const diff = daysUntil(date);
  if (diff < 0) {
    return {
      title: "受付終了",
      category: "受付終了",
      description: "過去の日付",
      pill: "3日前締切",
    };
  }
  if (CLOSED_DAYS.has(date.getDay())) {
    return {
      title: "貸切",
      category: "貸切",
      description: "予約済み",
      pill: "19:00-24:00",
    };
  }
  if (date.getDay() === OPEN_DAY) {
    return {
      title: "ふらっとハイよろ。",
      category: "ふらっとハイよろ。",
      description: "金曜は当日OK",
      pill: "金曜は当日OK",
    };
  }
  if (diff >= RESERVATION_DEADLINE_DAYS) {
    return {
      title: "空き",
      category: "空き",
      description: "3日前までにLINEで連絡",
      pill: "3日前までLINE",
    };
  }
  return {
    title: "受付終了",
    category: "受付終了",
    description: "3日前までの連絡制",
    pill: "3日前締切",
  };
}

function emptyEvent(date) {
  const status = statusForOpenSlot(date);
  return {
    id: `status-${dateKey(date)}`,
    title: status.title,
    category: status.category,
    start: nightStart(date).toISOString(),
    end: dayDisplayEnd(date).toISOString(),
    allDay: false,
    participants: [],
    description: status.description,
    pill: status.pill,
    status: true,
  };
}

function personalAbsenceEvent(date) {
  return {
    id: `absence-${dateKey(date)}`,
    title: "村長不在",
    category: "村長不在",
    start: nightStart(date).toISOString(),
    end: dayDisplayEnd(date).toISOString(),
    allDay: false,
    participants: [],
    description: "個人予定あり",
    pill: "19:00-24:00",
    status: true,
    usageOverride: false,
  };
}

function displayEventsForDate(date) {
  const actualEvents = eventsForDate(date);
  const blockedByPersonalCalendar = actualEvents.some((event) => (
    isPersonalBlockedEvent(event) &&
    overlapsRange(event, nightStart(date), dayDisplayEnd(date))
  ));
  if (blockedByPersonalCalendar) {
    const visibleEvents = actualEvents
      .filter((event) => {
        if (isPersonalBlockedEvent(event)) return false;
        if (!overlapsRange(event, nightStart(date), dayDisplayEnd(date))) return true;
        return isUsageOverrideEvent(event);
      })
      .filter((event) => state.activeCategories.has(event.category));
    const hasNightUsageOverride = visibleEvents.some((event) => (
      isUsageOverrideEvent(event) &&
      overlapsRange(event, nightStart(date), dayDisplayEnd(date))
    ));
    if (!hasNightUsageOverride && state.activeCategories.has("村長不在")) {
      visibleEvents.push(personalAbsenceEvent(date));
    }
    return visibleEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  }
  if (CLOSED_DAYS.has(date.getDay())) {
    const visibleEvents = actualEvents
      .filter((event) => !isPersonalBlockedEvent(event) && event.category !== "ふらっとハイよろ。")
      .filter((event) => state.activeCategories.has(event.category));
    if (!visibleEvents.some((event) => overlapsRange(event, nightStart(date), dayDisplayEnd(date)))) {
      const statusEvent = emptyEvent(date);
      if (state.activeCategories.has(statusEvent.category)) visibleEvents.push(statusEvent);
    }
    return visibleEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  }
  const visibleEvents = actualEvents.filter((event) => state.activeCategories.has(event.category));
  if (!hasNightEvent(date)) {
    const statusEvent = emptyEvent(date);
    if (state.activeCategories.has(statusEvent.category)) visibleEvents.push(statusEvent);
  }
  return visibleEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function clipEventToDisplay(event, date) {
  const start = event.allDay ? dayDisplayStart(date) : new Date(event.start);
  const end = event.allDay ? dayDisplayEnd(date) : new Date(event.end || event.start);
  const clippedStart = new Date(Math.max(start.getTime(), dayDisplayStart(date).getTime()));
  const clippedEnd = new Date(Math.min(end.getTime(), dayDisplayEnd(date).getTime()));
  if (clippedEnd <= clippedStart) return null;
  return { start: clippedStart, end: clippedEnd };
}

function eventPosition(event, date) {
  const range = clipEventToDisplay(event, date);
  if (!range) return null;
  const top = ((range.start - dayDisplayStart(date)) / 60000 / 60) * HOUR_HEIGHT;
  const height = Math.max(46, ((range.end - range.start) / 60000 / 60) * HOUR_HEIGHT);
  return { top, height };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayTimeText(event, date) {
  if (event.status) return event.pill || event.description || "19:00以降";
  const range = clipEventToDisplay(event, date);
  if (!range) return "";
  const suffix = event.participants.length ? ` ${event.participants.join(" / ")}` : event.description ? ` ${event.description}` : "";
  return `${formatTimeInDay(range.start, date)}-${formatTimeInDay(range.end, date)}${suffix}`;
}

function publicWeekEvents() {
  const { start, end } = weekRange();
  return state.events
    .filter((event) => event.category === "イベント" && overlapsRange(event, start, end))
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

function highlightDateLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}（${DAY_NAMES[date.getDay()]}）`;
}

function highlightTimeText(event) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  if (event.allDay) return "終日";
  return `${formatTimeInDay(start, start)}-${formatTimeInDay(end, start)}`;
}

function displayCategoryLabel(event) {
  if (event.category === "貸切" && !event.status) return "予約あり";
  return event.category;
}

function renderWeekHighlights() {
  const events = publicWeekEvents();
  els.weekHighlightsRange.textContent = formatWeek(state.viewDate);
  if (!events.length) {
    els.weekHighlights.innerHTML = `<p class="week-highlights__empty">今週の村人向けイベントはありません</p>`;
    return;
  }
  els.weekHighlights.innerHTML = events.map((event) => {
    const start = new Date(event.start);
    const people = event.participants.length ? `<span>${escapeHtml(event.participants.join(" / "))}</span>` : "";
    return `
      <button class="highlight-card" type="button" data-date="${dateKey(start)}">
        <strong>${escapeHtml(event.title)}</strong>
        <span>${highlightDateLabel(start)} ${highlightTimeText(event)}</span>
        ${people}
      </button>
    `;
  }).join("");

  els.weekHighlights.querySelectorAll(".highlight-card").forEach((button) => {
    button.addEventListener("click", () => {
      const [year, month, day] = button.dataset.date.split("-").map(Number);
      state.selectedDate = new Date(year, month - 1, day);
      render();
    });
  });
}

function renderTimeRail() {
  els.timeRail.innerHTML = "";
  for (let hour = DISPLAY_START_HOUR; hour <= DISPLAY_END_HOUR; hour += 1) {
    const mark = document.createElement("div");
    mark.className = "time-mark";
    mark.style.top = `${(hour - DISPLAY_START_HOUR) * HOUR_HEIGHT}px`;
    mark.textContent = `${hour}:00`;
    els.timeRail.appendChild(mark);
  }
}

function renderWeek() {
  const weekStart = startOfWeek(state.viewDate);
  const today = new Date();
  els.weekLabel.textContent = formatWeek(state.viewDate);
  els.weekHeaders.innerHTML = "";
  els.weekGrid.innerHTML = "";

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const header = document.createElement("button");
    header.type = "button";
    header.className = "week-day-header";
    header.dataset.weekday = date.getDay();
    header.setAttribute("aria-label", `${DAY_NAMES[date.getDay()]} ${date.getMonth() + 1}月${date.getDate()}日を表示`);
    if (isSameDate(date, today)) header.classList.add("is-today");
    if (isSameDate(date, state.selectedDate)) header.classList.add("is-selected");
    header.innerHTML = `
      <span>${DAY_NAMES[date.getDay()]}</span>
      <strong>${date.getDate()}</strong>
    `;
    header.addEventListener("click", () => {
      state.selectedDate = date;
      render();
    });
    els.weekHeaders.appendChild(header);

    const column = document.createElement("div");
    column.className = "week-day-column";
    if (isSameDate(date, today)) column.classList.add("is-today");
    if (isSameDate(date, state.selectedDate)) column.classList.add("is-selected");
    column.dataset.date = dateKey(date);
    column.dataset.weekday = date.getDay();
    column.addEventListener("click", () => {
      state.selectedDate = date;
      render();
    });

    displayEventsForDate(date).forEach((event) => {
      const position = eventPosition(event, date);
      if (!position) return;
      const block = document.createElement("button");
      block.type = "button";
      block.className = "week-event";
      block.dataset.category = event.category;
      block.style.top = `${position.top}px`;
      block.style.height = `${position.height}px`;
      block.innerHTML = `
        <strong>${escapeHtml(event.title)}</strong>
        <span>${escapeHtml(displayTimeText(event, date))}</span>
      `;
      block.addEventListener("click", (error) => {
        error.stopPropagation();
        state.selectedDate = date;
        render();
      });
      column.appendChild(block);
    });

    els.weekGrid.appendChild(column);
  }
}

function renderDetails() {
  const events = displayEventsForDate(state.selectedDate);
  els.selectedDateLabel.textContent = formatDate(state.selectedDate);
  if (!events.length) {
    els.selectedEvents.innerHTML = `<p class="empty-detail">表示中の項目はありません</p>`;
    return;
  }
  els.selectedEvents.innerHTML = events.map((event) => renderDetailEvent(event, state.selectedDate)).join("");
}

function renderDetailEvent(event, date) {
  const time = displayTimeText(event, date);
  const people = event.participants.length
    ? `<div class="people">${event.participants.map((person) => `<span class="person">${escapeHtml(person)}</span>`).join("")}</div>`
    : "";
  const memo = event.description
    ? `<p class="memo">${escapeHtml(event.description).replace(/\n/g, "<br>")}</p>`
    : "";
  return `
    <article class="detail-event">
      <div class="detail-event__top">
        <h4>${escapeHtml(event.title)}</h4>
        <span class="tag" data-category="${event.category}">${displayCategoryLabel(event)}</span>
      </div>
      <p class="detail-meta">${escapeHtml(time || "時間未設定")}</p>
      ${people}
      ${memo}
    </article>
  `;
}

function render() {
  renderWeekHighlights();
  renderTimeRail();
  renderWeek();
  renderDetails();
}

function bindEvents() {
  els.prevWeek.addEventListener("click", () => {
    state.viewDate = addDays(state.viewDate, -7);
    state.selectedDate = addDays(state.selectedDate, -7);
    loadEvents();
  });
  els.nextWeek.addEventListener("click", () => {
    state.viewDate = addDays(state.viewDate, 7);
    state.selectedDate = addDays(state.selectedDate, 7);
    loadEvents();
  });
  els.todayButton.addEventListener("click", () => {
    state.viewDate = new Date();
    state.selectedDate = new Date();
    loadEvents();
  });
  els.syncButton.addEventListener("click", loadEvents);
  document.querySelectorAll(".category-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.category;
      if (state.activeCategories.has(category)) {
        state.activeCategories.delete(category);
        button.classList.remove("is-active");
      } else {
        state.activeCategories.add(category);
        button.classList.add("is-active");
      }
      render();
    });
  });
}

bindEvents();
loadEvents();
