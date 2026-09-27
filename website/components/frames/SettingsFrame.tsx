import styles from "./frames.module.css";

export function SettingsFrame() {
  return (
    <div className={styles.chrome} aria-hidden="true">
      <div className={styles.titlebar}>
        <span className={`${styles.dot} ${styles.dotHot}`} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span>settings · host / remote</span>
      </div>
      <div className={styles.body}>
        <aside className={styles.side}>
          <span>Models</span>
          <span>Stems</span>
          <span className={styles.active}>Phase 4</span>
        </aside>
        <div className={`${styles.main} ${styles.settingsList}`}>
          <div className={styles.setting}>
            <span>YuE2 quant</span>
            <code>Q4_K_M</code>
          </div>
          <div className={styles.setting}>
            <span>Stem provider</span>
            <code>HTDemucs</code>
          </div>
          <div className={styles.setting}>
            <span>LoRA gate</span>
            <code>CC BY-NC</code>
          </div>
          <div className={styles.setting}>
            <span>Remote worker</span>
            <code>guarded</code>
          </div>
          <div className={styles.setting}>
            <span>max_loaded_models</span>
            <code>1</code>
          </div>
        </div>
      </div>
    </div>
  );
}
