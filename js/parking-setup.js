import { initParkingSetup } from "./pages/parking-setup.js";
import { startLocalTimer } from "./lib/timer-storage.js";

// P5 still owns preferences/review; P6 starts only on final confirmation.
// No config.js, database, authentication, or map is needed.
initParkingSetup(document.querySelector("#parking-setup"), {
  onConfirm(preferences) {
    startLocalTimer(preferences);
    location.assign("parking-timer.html");
  },
});
