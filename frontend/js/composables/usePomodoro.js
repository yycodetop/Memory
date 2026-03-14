import { ref } from 'vue';

export function usePomodoro() {
    const pomodoroModal = ref({
        show: false,
        taskItem: null,
        duration: 25,
        timeLeft: 25 * 60,
        isRunning: false,
        isPaused: false,
        intervalId: null
    });

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    const openPomodoroModal = (item) => {
        pomodoroModal.value.taskItem = item;
        pomodoroModal.value.timeLeft = 25 * 60;
        pomodoroModal.value.isRunning = false;
        pomodoroModal.value.isPaused = false;
        pomodoroModal.value.show = true;
    };

    const startPomodoro = () => {
        pomodoroModal.value.isRunning = true;
        pomodoroModal.value.intervalId = setInterval(() => {
            if (!pomodoroModal.value.isPaused) {
                pomodoroModal.value.timeLeft--;
                if (pomodoroModal.value.timeLeft <= 0) {
                    clearInterval(pomodoroModal.value.intervalId);
                    alert("专注完成！");
                    pomodoroModal.value.show = false;
                }
            }
        }, 1000);
    };

    const togglePomodoroPause = () => {
        pomodoroModal.value.isPaused = !pomodoroModal.value.isPaused;
    };

    const stopPomodoro = () => {
        clearInterval(pomodoroModal.value.intervalId);
        pomodoroModal.value.show = false;
    };

    return {
        pomodoroModal,
        openPomodoroModal,
        startPomodoro,
        togglePomodoroPause,
        stopPomodoro,
        formatTime
    };
}