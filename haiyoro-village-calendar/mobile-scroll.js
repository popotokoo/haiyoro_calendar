(function () {
  const targetTimeLabel = "18:00";
  const fallbackTop = 8 * 64;

  function targetTop() {
    const marks = Array.from(document.querySelectorAll(".time-mark"));
    const mark = marks.find((item) => item.textContent.trim() === targetTimeLabel);
    return mark ? Math.max(0, mark.offsetTop - 8) : fallbackTop;
  }

  function scrollToEvening() {
    const wrap = document.querySelector(".week-wrap");
    if (!wrap) return;
    requestAnimationFrame(() => {
      wrap.scrollTop = targetTop();
    });
  }

  function queueEveningScroll() {
    [80, 300, 800, 1600, 2800].forEach((delay) => {
      window.setTimeout(scrollToEvening, delay);
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    queueEveningScroll();
    ["prevWeek", "nextWeek", "todayButton", "syncButton"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", queueEveningScroll);
    });
  });

  window.addEventListener("load", queueEveningScroll);
})();
