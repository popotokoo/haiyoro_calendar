const CONFIG = {
  CALENDAR_NAME: '',
  CALENDAR_IDS: [
    'primary',
    'c_17ae3d956c66e0ad5413b6660495c4e72cc9308cf0101bb5b5e0d6d2353d450f@group.calendar.google.com',
  ],
  TIMEZONE: 'Asia/Tokyo',
};

const CATEGORIES = [
  'イベント',
  '貸切',
  'ふらっとハイよろ。',
  '村長不在',
  '受付終了',
];

const MANAGEMENT_LABEL_PATTERN = /^\s*(?:【(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)】|［(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)］|\[(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\]|「(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)」|（(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)）|\((?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\))\s*/;
const MANAGEMENT_INLINE_LABEL_PATTERN = /\s*(?:【(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)】|［(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)］|\[(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\]|「(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)」|（(?:イベント|ビジネス利用|スペース利用|友達利用|貸切)）|\((?:イベント|ビジネス利用|スペース利用|友達利用|貸切)\))\s*/g;
const EVENT_MARKER_PATTERN = /(?:【|［|\[|「|（|\()\s*イベント\s*(?:】|］|\]|」|）|\))/i;
const PRIVATE_MARKER_PATTERN = /(?:【|［|\[|「|（|\()\s*(?:貸切|ビジネス利用|スペース利用|友達利用)\s*(?:】|］|\]|」|）|\))/i;
const PRIVATE_TITLE_ALIASES = ['大岩キッチン'];

function doGet(e) {
  const params = e.parameter || {};
  const start = params.start ? new Date(params.start) : startOfWeek_(new Date());
  const end = params.end ? new Date(params.end) : addDays_(start, 7);
  const callback = params.callback || '';
  const payload = {
    syncedAt: new Date().toISOString(),
    calendarName: CONFIG.CALENDAR_NAME,
    events: listEvents_(start, end),
  };
  const body = callback
    ? `${callback}(${JSON.stringify(payload)});`
    : JSON.stringify(payload);
  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function listEvents_(start, end) {
  const output = [];
  const byTime = {};
  getCalendars_().forEach(({ calendar, sourceId }) => {
    calendar.getEvents(start, end).forEach((event) => {
      normalizeEvent_(event, sourceId).forEach((normalized) => {
        const timeKey = `${normalized.start}|${normalized.end}`;
        const existingIndex = byTime[timeKey];
        if (existingIndex !== undefined && shouldReplaceEvent_(output[existingIndex], normalized)) {
          output[existingIndex] = normalized;
          return;
        }
        byTime[timeKey] = output.length;
        output.push(normalized);
      });
    });
  });
  return applyAvailabilityBlocks_(output).sort((a, b) => new Date(a.start) - new Date(b.start));
}

function normalizeEvent_(event, sourceId) {
  const title = event.getTitle();
  const description = event.getDescription() || '';
  const startTime = event.getStartTime();
  const endTime = event.getEndTime();
  const category = detectCategory_(title, description);
  const isPrimary = sourceId === 'primary';
  const usageOverride = isUsageOverrideEvent_({ title, description, category });
  if (isPrimary && !usageOverride) {
    return normalizePrimaryBusyEvents_(event, sourceId);
  }
  const shouldReveal = Boolean(category) || !isPrimary;
  const displayCategory = category || (isPrimary ? '空いていない' : 'イベント');
  return [{
    id: `${sourceId}:${event.getId()}`,
    title: shouldReveal ? displayTitle_(title) || displayCategory : '空いていない',
    category: displayCategory,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    allDay: event.isAllDayEvent(),
    location: shouldReveal ? event.getLocation() || '' : '',
    description: shouldReveal ? description : '予定あり',
    participants: shouldReveal ? extractParticipants_(title, description) : [],
    sourceCalendar: sourceId,
    usageOverride,
  }];
}

function normalizePrimaryBusyEvents_(event, sourceId) {
  const output = [];
  const eventStart = event.getStartTime();
  const eventEnd = event.getEndTime();
  let day = startOfDay_(eventStart);
  while (day < eventEnd) {
    const nightStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 19, 0, 0);
    const dayEnd = addDays_(day, 1);
    if (eventEnd > nightStart && eventStart < dayEnd) {
      output.push({
        id: `${sourceId}:${event.getId()}:${nightStart.toISOString()}`,
        title: '村長不在',
        category: '村長不在',
        start: nightStart.toISOString(),
        end: dayEnd.toISOString(),
        allDay: false,
        location: '',
        description: '個人予定あり',
        participants: [],
        sourceCalendar: sourceId,
        usageOverride: false,
      });
    }
    day = addDays_(day, 1);
  }
  return output;
}

function applyAvailabilityBlocks_(events) {
  const blockedDays = {};
  events.forEach((event) => {
    if (isPersonalBlockedEvent_(event)) {
      blockedDays[dateKey_(new Date(event.start))] = true;
    }
  });
  if (!Object.keys(blockedDays).length) return events;
  return events.filter((event) => {
    const key = dateKey_(new Date(event.start));
    if (!blockedDays[key]) return true;
    return isPersonalBlockedEvent_(event) || isUsageOverrideEvent_(event) || !overlapsNight_(event);
  });
}

function shouldReplaceEvent_(existing, incoming) {
  if (!existing) return false;
  if (isPersonalBlockedEvent_(existing) && !isPersonalBlockedEvent_(incoming)) {
    return isUsageOverrideEvent_(incoming);
  }
  return existing.category === '空いていない' && incoming.category !== '空いていない';
}

function isPersonalBlockedEvent_(event) {
  return ['村長不在', '空きなし', '空いていない'].indexOf(event.category) >= 0;
}

function isUsageOverrideEvent_(event) {
  if (event.usageOverride) return true;
  if (event.sourceCalendar === 'primary' && event.category === '貸切') return true;
  const source = `${event.category || ''}\n${event.title || ''}\n${event.description || ''}`;
  return source.indexOf('ビジネス利用') >= 0 || source.indexOf('スペース利用') >= 0 || source.indexOf('友達利用') >= 0;
}

function overlapsNight_(event) {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end || event.start);
  if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return false;
  let day = startOfDay_(eventStart);
  while (day < eventEnd) {
    const nightStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 19, 0, 0);
    const dayEnd = addDays_(day, 1);
    if (eventEnd > nightStart && eventStart < dayEnd) return true;
    day = addDays_(day, 1);
  }
  return false;
}

function displayTitle_(title) {
  return String(title || '')
    .replace(MANAGEMENT_LABEL_PATTERN, '')
    .replace(MANAGEMENT_INLINE_LABEL_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getCalendars_() {
  return CONFIG.CALENDAR_IDS.map((sourceId) => {
    if (!sourceId || sourceId === 'primary') {
      return {
        sourceId: 'primary',
        calendar: CalendarApp.getDefaultCalendar(),
      };
    }
    const calendarById = CalendarApp.getCalendarById(sourceId);
    if (!calendarById) {
      throw new Error(`Calendar not found: ${sourceId}`);
    }
    return {
      sourceId,
      calendar: calendarById,
    };
  });
}

function detectCategory_(title, description) {
  const rawSource = `${title}\n${description}`;
  if (EVENT_MARKER_PATTERN.test(rawSource)) return 'イベント';
  if (PRIVATE_MARKER_PATTERN.test(rawSource)) return '貸切';
  const cleanedTitle = displayTitle_(title).toLowerCase().replace(/\s+/g, '');
  if (PRIVATE_TITLE_ALIASES.some((alias) => cleanedTitle === alias.toLowerCase().replace(/\s+/g, ''))) return '貸切';
  const source = rawSource.toLowerCase().replace(/\s+/g, '');
  if (
    source.indexOf('ビジネス利用') >= 0 ||
    source.indexOf('スペース利用') >= 0 ||
    source.indexOf('友達利用') >= 0
  ) return '貸切';
  for (const category of CATEGORIES) {
    if (source.indexOf(category.toLowerCase().replace(/\s+/g, '')) >= 0) return category;
  }
  if (
    source.indexOf('flatハイヨロ') >= 0 ||
    source.indexOf('flatハイよろ') >= 0 ||
    source.indexOf('flatok') >= 0 ||
    source.indexOf('ふらっとok') >= 0 ||
    source.indexOf('ふらっとハイよろ') >= 0
  ) return 'ふらっとハイよろ。';
  if (
    source.indexOf('大岩キッチン') >= 0 ||
    source.indexOf('オーヤキッチン') >= 0 ||
    source.indexOf('オヤキッチン') >= 0 ||
    source.indexOf('おやキッチン') >= 0 ||
    source.indexOf('oyakitchen') >= 0 ||
    source.indexOf('応用キッチン') >= 0 ||
    source.indexOf('お祝いキッチン') >= 0 ||
    source.indexOf('キャッシュフローゲーム') >= 0
  ) return 'イベント';
  if (
    source.indexOf('貸し切り') >= 0 ||
    source.indexOf('予約あり') >= 0 ||
    source.indexOf('ビジネス利用') >= 0 ||
    source.indexOf('スペース利用') >= 0 ||
    source.indexOf('友達利用') >= 0
  ) return '貸切';
  return '';
}

function extractParticipants_(title, description) {
  const source = `${title}\n${description}`;
  const match = source.match(/(?:参加者|参加|来る人|村人)[:：]\s*([^\n]+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,\/／]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function startOfDay_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey_(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function startOfWeek_(date) {
  const start = startOfDay_(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function addDays_(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
