import styles from "./frames.module.css";

const NOTES = [
  { left: "8%", top: "22%", width: "14%" },
  { left: "24%", top: "38%", width: "10%" },
  { left: "36%", top: "30%", width: "18%" },
  { left: "56%", top: "48%", width: "12%" },
  { left: "70%", top: "26%", width: "16%" },
];

export function PianoRollFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>piano roll · ABC YuE2</span>
      </div>
      <div className={styles.body}>
        <aside className={styles.side}>
          <span>MIDI</span>
          <span className={styles.active}>Roll</span>
          <span>ABC</span>
        </aside>
        <div className={`${styles.main} ${styles.piano}`}>
          <div className={styles.pianoKeys}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className={`${styles.key} ${i % 3 === 1 ? styles.keyBlack : ""}`}
              />
            ))}
          </div>
          <div className={styles.roll}>
            {NOTES.map((n, i) => (
              <span
                key={i}
                className={styles.note}
                style={{ left: n.left, top: n.top, width: n.width }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
