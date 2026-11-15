import { useStore } from '../hooks/useStore';
export function Statistics({ onResume }: { onResume: (id: string) => void }) {
  const { data } = useStore();
  const results = data.sessions.flatMap((s) => s.results);
  const total = results.length;
  const counts = {
    known: results.filter((r) => r.rating === 'known').length,
    hard: results.filter((r) => r.rating === 'hard').length,
    unknown: results.filter((r) => r.rating === 'unknown').length,
  };
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 13 + i);
    const key = d.toLocaleDateString('ru-RU');
    return {
      label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      count: results.filter((r) => new Date(r.reviewedAt).toLocaleDateString('ru-RU') === key)
        .length,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Ваш прогресс</h1>
          <p>Знания растут с каждым возвращением.</p>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span>Всего оценок</span>
          <strong>{total}</strong>
          <small>{data.sessions.length} учебных сессий</small>
        </div>
        {(
          [
            ['known', 'Знаю'],
            ['hard', 'Сложно'],
            ['unknown', 'Не знаю'],
          ] as const
        ).map(([r, l]) => (
          <div className={`stat-card ${r}`} key={r}>
            <span>{l}</span>
            <strong>{counts[r]}</strong>
            <small>{total ? Math.round((counts[r] / total) * 100) : 0}% всех оценок</small>
          </div>
        ))}
      </div>
      <section className="panel chart-panel">
        <h2>Последние две недели</h2>
        <p className="muted">Количество оценённых карточек по дням</p>
        <div className="chart">
          {days.map((d) => (
            <div className="chart-column" key={d.label} title={`${d.label}: ${d.count}`}>
              <b>{d.count || ''}</b>
              <div style={{ height: `${Math.max(3, (d.count / max) * 140)}px` }} />
              <small>{d.label}</small>
            </div>
          ))}
        </div>
      </section>
      <section className="panel history">
        <h2>История изучения</h2>
        {data.sessions.length ? (
          data.sessions.map((s) => (
            <div className="history-row" key={s.id}>
              <div>
                <b>{new Date(s.startedAt).toLocaleString('ru-RU')}</b>
                <p>
                  {s.endedAt ? 'Завершена' : 'Не завершена'} · Оценено {s.results.length} /{' '}
                  {s.cardIds.length}
                </p>
              </div>
              <div className="actions">
                {!s.endedAt && s.cardIds.length > 0 && (
                  <button onClick={() => onResume(s.id)}>Продолжить сессию</button>
                )}
                {(['known', 'hard', 'unknown'] as const).map((r) => (
                  <span key={r} className={`rating-dot ${r}`}>
                    {s.results.filter((v) => v.rating === r).length}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty">
            <h3>Первая сессия ещё впереди</h3>
            <p>Оцените карточки в режиме изучения — и здесь появятся результаты.</p>
          </div>
        )}
      </section>
    </main>
  );
}
