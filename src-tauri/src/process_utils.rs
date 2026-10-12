#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Keep a non-interactive child from opening a console under the GUI app.
pub fn configure_no_window(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// Tokio's process wrapper needs the same Windows creation flag.
pub fn configure_tokio_no_window(command: &mut tokio::process::Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    #[cfg(not(windows))]
    let _ = command;
}

#[cfg(all(test, windows))]
mod tests {
    use super::configure_no_window;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetConsoleWindow() -> *mut std::ffi::c_void;
    }

    const CHILD_MARKER: &str = "SONG_MAKER_NO_WINDOW_TEST_CHILD";
    const TEST_NAME: &str = "process_utils::tests::no_window_child_has_no_console";

    #[test]
    fn no_window_child_has_no_console() {
        if std::env::var_os(CHILD_MARKER).is_some() {
            let console_window = unsafe { GetConsoleWindow() };
            assert!(
                console_window.is_null(),
                "child unexpectedly has a console window"
            );
            return;
        }

        let executable = std::env::current_exe().expect("current test executable");
        let mut command = std::process::Command::new(executable);
        command
            .args(["--exact", TEST_NAME, "--nocapture"])
            .env(CHILD_MARKER, "1");
        configure_no_window(&mut command);

        let output = command.output().expect("start no-console test child");
        assert!(
            output.status.success(),
            "child console check failed: {}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
