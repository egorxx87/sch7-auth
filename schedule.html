<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="robots" content="noindex, nofollow">
  <title>Розклад змін</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="layout">
    <header class="header">
      <h1 class="header__title">Розклад змін</h1>
      <p class="header__subtitle">
      Дані беруться з Google Таблиці (лист <strong>Arbeitsplan</strong>).
      </p>
    </header>

    <!-- НАВИГАЦИЯ -->
    <div class="top-nav">
  <a class="top-nav__btn" href="index.html">Головна</a>
  <a class="top-nav__btn top-nav__btn--active" href="schedule.html">Розклад</a>
  <a class="top-nav__btn" href="reservation.html">Резервації</a>
  <a class="top-nav__btn" href="tasks.html">Завдання</a>
   <a class="top-nav__btn" href="calendar.html">Календар</a>
</div>

    <main>
      <!-- СЕКЦИЯ РАСПИСАНИЯ -->
      <div id="section-schedule">
        <div class="card">
          <div class="view-toggle">
            <button id="mode-day" class="view-toggle__btn view-toggle__btn--active">День</button>
            <button id="mode-week" class="view-toggle__btn">Тиждень</button>
            <button id="mode-month" class="view-toggle__btn">Місяць</button>
          </div>

          <div class="week-nav">
            <button id="schedule-prev-period" class="week-nav__btn">‹ Попередній</button>

            <div class="week-nav__label-wrap">
              <div id="schedule-week-label" class="week-nav__label">Завантажую розклад…</div>
              <div id="schedule-sub-label" class="week-nav__sub"> </div>
            </div>

            <div class="week-nav__right">
              <button id="open-stats" class="week-nav__btn week-nav__btn--ghost">Статистика робочих годин</button>
              <button id="day-view-toggle" class="week-nav__btn week-nav__btn--ghost" style="display:none;">Вид: Компакт</button>
              <button id="schedule-today" class="week-nav__btn">Сьогодні</button>
              <button id="schedule-next-period" class="week-nav__btn">Наступний ›</button>
            </div>
          </div>

          <!-- ФИЛЬТР ДЛЯ РЕЖИМА "НЕДЕЛЯ" -->
          <div id="week-filter" class="week-filter" style="display:none;">
            <button class="week-filter__pill week-filter__pill--active" data-week-filter="all">Все</button>
            <button class="week-filter__pill" data-week-filter="admin">Адміни</button>
            <button class="week-filter__pill" data-week-filter="kellner">Офіціанти</button>
            <button class="week-filter__pill" data-week-filter="kueche">Кухня</button>
            <button class="week-filter__pill" data-week-filter="reinigung">Прибирання</button>
          </div>

          <!-- КОМПАКТНЫЙ ВИД НЕДЕЛИ -->
          <div id="week-compact-view" style="display:none;"></div>

          <div id="schedule-content"></div>

          <div class="footer-note">
            Натисніть на ім'я (або на «—»), щоб вибрати співробітника. Після вибору можна продовжити зміну вниз цього дня.
            Зміни зберігаються в Таблиці Google.
          </div>
        </div>
      </div>

      <!-- СЕКЦИЯ СТАТИСТИКИ (открывается кнопкой) -->
      <div id="section-stats" style="display:none;">
        <div class="card stats-card">
          <div class="stats-header">
            <h2 class="stats-title">Статистика робочих годин</h2>
            <button id="close-stats" class="week-nav__btn">← Назад</button>
          </div>

          <p class="stats-subtitle">
            Кожен вартовий слот = 1 год. Порожні осередки («—») не рахуються.
          </p>

          <div class="stats-controls">
            <div class="stats-control-group">
              <span class="stats-label">Місяць:</span>
              <button id="stats-month-current" class="stats-toggle-btn stats-toggle-btn--active">Поточний</button>
              <button id="stats-month-prev" class="stats-toggle-btn">Минулий</button>
              <span class="stats-label stats-label--sub">або</span>
              <input id="stats-month-input" class="stats-month-input" type="month" />
              <button id="stats-month-auto" class="stats-toggle-btn stats-toggle-btn--ghost" type="button">Авто</button>
            </div>

            <div class="stats-control-group">
              <span class="stats-label">Роль:</span>
              <button class="stats-toggle-pill stats-toggle-pill--active" data-stats-role="all">Усі</button>
              <button class="stats-toggle-pill" data-stats-role="kellner">Kellner</button>
              <button class="stats-toggle-pill" data-stats-role="kueche">Küche</button>
              <button class="stats-toggle-pill" data-stats-role="reinigung">Reinigung</button>
            </div>
          </div>

          <div id="stats-summary" class="stats-summary"></div>
          <div id="stats-table" class="stats-table-wrapper"></div>
        </div>
      </div>
    </main>
  </div>

  <!-- Модал выбора сотрудника -->
  <div id="picker-backdrop" class="picker-backdrop picker-hidden">
    <div class="picker" role="dialog" aria-modal="true">
      <div class="picker-title">Виберіть співробітника</div>
      <div class="picker-role-label" id="picker-role-label"></div>
      <div id="picker-options" class="picker-options"></div>
      <div class="picker-actions">
        <button id="picker-clear" class="danger">Очистити</button>
        <button id="picker-custom">Інше ім'я…</button>
        <button id="picker-cancel">Скасування</button>
      </div>
    </div>
  </div>

  <!-- Лоадер -->
  <div id="global-loader" class="global-loader global-loader--hidden">
    <div class="spinner"></div>
    <div id="global-loader-text" class="global-loader__text">Завантаження</div>
  </div>

  <script src="script.js"></script>
</body>
</html>