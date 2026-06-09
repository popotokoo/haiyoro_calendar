(function () {
  const closedDayLabels = [
    "経営者会利用",
    "懇親会貸切",
    "ビジネス交流会",
    "ボードゲーム会",
    "ワイン会",
  ];

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function labelForDate(date) {
    let seed = 0;
    for (const char of dateKey(date)) seed = (seed * 31 + char.charCodeAt(0)) % 9973;
    return closedDayLabels[seed % closedDayLabels.length];
  }

  const originalStatusForOpenSlot = window.statusForOpenSlot;
  if (typeof originalStatusForOpenSlot !== "function") return;

  window.statusForOpenSlot = function statusForOpenSlotWithClosedDayLabels(date) {
    if (date.getDay() === 0 || date.getDay() === 3) {
      return {
        title: labelForDate(date),
        category: "貸切",
        description: "予約済み",
        pill: "19:00-24:00",
      };
    }
    return originalStatusForOpenSlot(date);
  };

  if (typeof window.render === "function") window.render();
})();
