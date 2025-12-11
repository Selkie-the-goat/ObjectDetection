# 🎯 Accessible: An AI Object Detection System (YOLOv8/YOLOv11)

This project implements a professional, real-time object detection system designed with a strong focus on accessibility. It uses a modern computer vision backend (Ultralytics YOLO) and a responsive, dark-themed frontend with robust accessibility features like screen reader announcements, high-contrast modes, and customizable voice feedback.

## 🌟 Features

* **Real-Time Detection:** Utilizes a YOLO model (configured for YOLOv8/YOLOv11) for fast, concurrent object detection.
* **WebSockets Communication:** Efficiently streams video frames (base64) from the frontend to the FastAPI backend and receives detection results.
* **Full Accessibility (A11Y):** Includes multiple features for users with different abilities:
    * **Screen Reader Support:** Uses `role="status"` and `aria-live="polite"` regions for announcements (`#liveRegion`).
    * **High Contrast & Large Text Modes:** CSS toggles for enhanced readability.
    * **Voice Announcements (TTS):** Natural language descriptions of detected objects with a configurable speech rate and detail level.
    * **Skip Link:** Enables quick navigation for keyboard users (`.skip-link`).
* **Professional UI:** A responsive, dark-themed interface built with a modern aesthetic and strong visual hierarchy.
* **Performance Metrics:** Displays real-time FPS, total frames, and current object count.

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | Python, FastAPI, Ultralytics YOLOv8/YOLOv11 | Handles model loading, real-time detection, and WebSocket management. |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) | Captures webcam feed, manages rendering, and controls accessibility features. |
| **Model** | `yolo11n.pt` (YOLOv11 Nano) | The configured detection model. |

## 🚀 Getting Started

Follow these steps to get the system up and running on your local machine.

### 1. Prerequisites

You need **Python 3.9+** and a modern web browser.

### 2. Backend Setup

The Python backend handles the heavy lifting of object detection.

1.  **Clone the repository (or set up files):** Ensure you have `server.py`, `script.js`, `style.css`, and `index.html` in the same directory.
2.  **Install Dependencies:** Create a virtual environment and install the required packages.
    ```bash
    # Assuming you have the requirements.txt generated previously
    pip install -r requirements.txt
    
    # If not, install manually:
    pip install fastapi uvicorn 'python-multipart' opencv-python ultralytics numpy pillow
    ```
3.  **Download the YOLO Model:** You will need a pre-trained YOLO model file (e.g., `yolo11n.pt`). Place this file in the project directory, ensuring the name matches the `YOLO_MODEL_PATH` variable in `server.py`.
4.  **Run the Server:**
    ```bash
    python server.py
    # or
    uvicorn server:app --host 0.0.0.0 --port 8000
    ```

### 3. Frontend Access

1.  Open your web browser and navigate to:
    ```
    http://localhost:8000
    ```
2.  The application should load, prompting you for webcam access.
3.  Click the **▶ Start Detection** button to initialize the webcam, establish the WebSocket connection, and begin the real-time detection loop.

## ♿ Accessibility Controls

The system provides several controls for an inclusive user experience:

| Control | Functionality | File Reference |
| :--- | :--- | :--- |
| **High Contrast** | Toggles a dedicated CSS mode for stark color contrast. | `style.css`, `script.js`. |
| **Large Text** | Increases all font sizes for improved readability. | `style.css`, `script.js`. |
| **Voice Enabled** | Turns the Text-to-Speech (TTS) announcements on or off. | `script.js`. |
| **Speech Speed** | Adjusts the rate of the voice announcements (0.5x to 2.0x). | `script.js`. |
| **Detailed Descriptions** | Toggles between simple object counts and more complex spatial/location announcements. | `script.js`. |

## ⚠️ Known Issues

* **Model Accuracy:** The description notes the model is **45% accurate**; detection quality is highly dependent on the model weights (`yolo11n.pt`) used.
* **Speech Queue Management:** The TTS implementation uses a custom queue to manage announcements, which helps prevent voice overload, but complex rapid detections might still lead to slight delays.
* **GPU Usage:** The `server.py` is configured to use `'cpu'` by default. Performance will be significantly better if a GPU is available and configured by changing the `device='cpu'` parameter in `detect_objects_yolo` to `'0'` or `'cuda:0'`.