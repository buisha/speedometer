
const MAX_SPEED = 220;

const dial = document.getElementById("dial");
const dialTicks = document.getElementById("dialTicks");
const dialLabels = document.getElementById("dialLabels");
const needle = document.getElementById("needle");

const startButton = document.getElementById("startButton");
const statusText = document.getElementById("status");
const menuStatus = document.getElementById("menuStatus");

let watchId = null;
let selectedUnit = "kmh";
let currentSpeedKmh = 0;
let maxSpeedKmh = 0;
let lastPosition = null;
let samples = [];
let isRunning = false;

const unitInfo = {
    kmh: {
        label: "km/h",
        factor: 1
    },
    mph: {
        label: "mph",
        factor: 0.621371
    },
    ms: {
        label: "m/s",
        factor: 1 / 3.6
    }
};

// CREATE SPEEDOMETER DIAL
function buildDial() {

    for (let value = 0; value <= MAX_SPEED; value += 5) {

        const tick = document.createElement("span");

        tick.className =
            `tick${value % 20 === 0 ? " major" : ""}`;

        const angle = -150 + (value / MAX_SPEED) * 300;

        tick.style.transform =
            `translateX(-50%) rotate(${angle}deg)`;

        dialTicks.appendChild(tick);

        if (value % 20 === 0) {

            const label = document.createElement("span");

            label.className = "dial-label";
            label.textContent = value;

            const radius = 42;
            const radians = (angle - 90) * Math.PI / 180;

            label.style.left =
                `${50 + radius * Math.cos(radians)}%`;

            label.style.top =
                `${50 + radius * Math.sin(radians)}%`;

            dialLabels.appendChild(label);
        }
    }
}

// CONVERT SPEED
function formatSpeed(kmh, decimals = 1) {

    const converted =
        kmh * unitInfo[selectedUnit].factor;

    return converted.toFixed(decimals);
}

// UPDATE SPEEDOMETER
function updateDisplay() {

    const value = Number(formatSpeed(currentSpeedKmh));

    const angle =
        -150 + (Math.min(currentSpeedKmh, MAX_SPEED)
        / MAX_SPEED) * 300;

    needle.style.transform =
        `rotate(${angle}deg)`;

    document.getElementById("dialValue").textContent =
        Math.round(value);

    document.getElementById("digitalValue").textContent =
        value.toFixed(1);

    document.getElementById("dialUnit").textContent =
        unitInfo[selectedUnit].label;

    document.getElementById("digitalUnit").textContent =
        unitInfo[selectedUnit].label;

    document.getElementById("maxSpeed").textContent =
        `${formatSpeed(maxSpeedKmh)} ${unitInfo[selectedUnit].label}`;
}

// ANALOG / DIGITAL MODE
function setMode(mode) {

    const analog = mode === "analog";

    dial.hidden = !analog;

    document.getElementById("digitalPanel").hidden =
        analog;

    document.getElementById("analogMode")
        .classList.toggle("active", analog);

    document.getElementById("digitalMode")
        .classList.toggle("active", !analog);
}

document.getElementById("analogMode")
    .addEventListener("click", () => setMode("analog"));

document.getElementById("digitalMode")
    .addEventListener("click", () => setMode("digital"));

// CHANGE SPEED UNIT
document.querySelectorAll(".unit-button")
    .forEach(button => {

        button.addEventListener("click", () => {

            selectedUnit = button.dataset.unit;

            document.querySelectorAll(".unit-button")
                .forEach(item => {
                    item.classList.toggle(
                        "selected",
                        item === button
                    );
                });

            updateDisplay();
        });
    });

// STATUS MESSAGE
function setStatus(message) {

    statusText.textContent = message;

    menuStatus.textContent =
        isRunning ? "Tracking" : message;
}

// START GPS
function startTracking() {

    if (!navigator.geolocation) {

        setStatus("GPS is not supported by this browser.");
        return;
    }

    if (!window.isSecureContext) {

        setStatus(
            "GPS requires HTTPS or localhost. Use Live Server."
        );

        return;
    }

    isRunning = true;
    lastPosition = null;

    startButton.textContent = "STOP";
    startButton.classList.add("running");

    setStatus("Waiting for GPS signal...");

    watchId = navigator.geolocation.watchPosition(

        position => {

            const coords = position.coords;

            let speedMs = coords.speed;

            // ESTIMATE SPEED IF GPS DOES NOT PROVIDE IT
            if (
                speedMs == null ||
                !Number.isFinite(speedMs) ||
                speedMs < 0
            ) {

                if (lastPosition) {

                    const distance = haversineMeters(
                        lastPosition.latitude,
                        lastPosition.longitude,
                        coords.latitude,
                        coords.longitude
                    );

                    const seconds =
                        (position.timestamp -
                        lastPosition.timestamp) / 1000;

                    speedMs =
                        seconds > 0 ? distance / seconds : 0;

                } else {
                    speedMs = 0;
                }
            }

            lastPosition = {
                latitude: coords.latitude,
                longitude: coords.longitude,
                timestamp: position.timestamp
            };

            // IGNORE INACCURATE GPS READINGS
            if (coords.accuracy <= 100) {

                const measuredKmh =
                    Math.max(0, speedMs * 3.6);

                // SMOOTH GPS SPEED
                currentSpeedKmh =
                    currentSpeedKmh * 0.35 +
                    measuredKmh * 0.65;

                if (currentSpeedKmh < 1.2) {
                    currentSpeedKmh = 0;
                }

                maxSpeedKmh = Math.max(
                    maxSpeedKmh,
                    currentSpeedKmh
                );

                samples.push({
                    time: new Date(
                        position.timestamp
                    ).toISOString(),

                    speedKmh: currentSpeedKmh,
                    accuracy: coords.accuracy
                });

                document.getElementById("accuracy")
                    .textContent =
                    `±${Math.round(coords.accuracy)} m`;

                setStatus("GPS tracking active");

            } else {

                setStatus(
                    "GPS signal is inaccurate. Try an open area."
                );

                document.getElementById("accuracy")
                    .textContent =
                    `±${Math.round(coords.accuracy)} m`;
            }

            updateDisplay();
        },

        error => {

            const messages = {
                1: "Location permission denied. Allow GPS access.",
                2: "GPS position unavailable. Check location settings.",
                3: "GPS timed out. Try again."
            };

            stopTracking();

            setStatus(
                messages[error.code] ||
                "Could not get GPS location."
            );
        },

        {
            enableHighAccuracy: true,
            maximumAge: 1000,
            timeout: 15000
        }
    );
}

// STOP GPS
function stopTracking() {

    if (watchId !== null) {

        navigator.geolocation.clearWatch(watchId);
    }

    watchId = null;
    isRunning = false;

    currentSpeedKmh = 0;
    lastPosition = null;

    startButton.textContent = "START";

    startButton.classList.remove("running");

    updateDisplay();

    menuStatus.textContent = "Stopped";
}

// CALCULATE DISTANCE BETWEEN GPS POINTS
function haversineMeters(lat1, lon1, lat2, lon2) {

    const toRad = degrees =>
        degrees * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 6371000 *
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );
}

// START / STOP BUTTON
startButton.addEventListener("click", () => {

    if (isRunning) {
        stopTracking();
    } else {
        startTracking();
    }
});

// DARK / LIGHT MODE
document.getElementById("themeButton")
    .addEventListener("click", () => {

        document.body.classList.toggle("dark");

        document.getElementById("themeButton")
            .textContent =
            document.body.classList.contains("dark")
                ? "☀"
                : "☾";
    });

// MENU
const menuButton =
    document.getElementById("menuButton");

const menuPanel =
    document.getElementById("menuPanel");

menuButton.addEventListener("click", () => {

    const opening = menuPanel.hidden;

    menuPanel.hidden = !opening;

    menuButton.setAttribute(
        "aria-expanded",
        String(opening)
    );
});

// RESET DATA
document.getElementById("resetButton")
    .addEventListener("click", () => {

        maxSpeedKmh = 0;
        samples = [];

        updateDisplay();

        setStatus("Recorded data reset");

        menuPanel.hidden = true;

        menuButton.setAttribute(
            "aria-expanded",
            "false"
        );
    });

// CLOSE NOTIFICATION
document.getElementById("closeNotice")
    .addEventListener("click", () => {

        document.getElementById("notice").hidden = true;
    });

// DOWNLOAD GPS DATA
document.getElementById("downloadButton")
    .addEventListener("click", () => {

        if (samples.length === 0) {

            setStatus(
                "No GPS readings recorded yet. Start tracking first."
            );

            return;
        }

        const rows = [
            "time,speed_kmh,gps_accuracy_m",

            ...samples.map(sample =>
                `${sample.time},${sample.speedKmh.toFixed(2)},${sample.accuracy.toFixed(1)}`
            )
        ];

        const blob = new Blob(
            [rows.join("\n")],
            { type: "text/csv;charset=utf-8" }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = "speedometer-data.csv";

        link.click();

        URL.revokeObjectURL(url);
    });

// CLEAN UP GPS
window.addEventListener("beforeunload", () => {

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
});

// INITIALIZE APP
buildDial();
updateDisplay();
