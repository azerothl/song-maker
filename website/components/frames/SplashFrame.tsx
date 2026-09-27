import styles from "./frames.module.css";

export function SplashFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>song-maker · local</span>
      </div>
      <div className={styles.splashBody}>
        <h3 className={styles.brandMark}>Song Maker</h3>
      </div>
    </div>
  );
}
