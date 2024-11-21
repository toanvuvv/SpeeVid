const fetch = require("node-fetch");
const chalk = require("chalk");
const fs = require("fs");
const { chromium } = require("playwright");
const readline = require("readline");
const { Headers } = require("node-fetch");
const { exec } = require('child_process');
const path = require('path');

// Set constants
const RETRY_FILE = "retry.txt";

// Ensure retry file exists
if (!fs.existsSync(RETRY_FILE)) {
  fs.writeFileSync(RETRY_FILE, "");
}

// Check ADB connection
const checkAdbConnection = () => {
  return new Promise((resolve, reject) => {
    exec('adb devices', (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      const devices = stdout.toString().split('\n')
        .filter(line => line.includes('device'))
        .filter(line => !line.includes('List of devices attached'));
      
      if (devices.length === 0) {
        reject(new Error('No Android device connected'));
        return;
      }
      resolve();
    });
  });
};

// Push to Android
const pushToAndroid = (filePath) => {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const androidPath = `/sdcard/Movies/TikTok/${fileName}`;
    
    exec(`adb push "${filePath}" "${androidPath}"`, async (error, stdout, stderr) => {
      if (error) {
        console.log(chalk.red(`[X] Error pushing to Android: ${error.message}`));
        reject(error);
        return;
      }
      console.log(chalk.green(`[+] Pushed to Android: ${androidPath}`));
      
      // Trigger media scan after successful push
      try {
        await new Promise((resolveMedia, rejectMedia) => {
          exec('adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///storage/emulated/0', (mediaError, mediaStdout, mediaStderr) => {
            if (mediaError) {
              console.log(chalk.yellow(`[!] Media scan warning: ${mediaError.message}`));
              resolveMedia(); // Continue even if media scan fails
            } else {
              console.log(chalk.green(`[+] Media scan completed`));
              resolveMedia();
            }
          });
        });
      } catch (mediaError) {
        console.log(chalk.yellow(`[!] Media scan error: ${mediaError.message}`));
      }
      
      resolve();
    });
  });
};

// Helper functions for retry logic
const getRetryUrls = () => {
  if (!fs.existsSync(RETRY_FILE)) return [];
  return fs.readFileSync(RETRY_FILE, "utf-8").split("\n").filter(Boolean);
};

const logRetry = (url) => {
  fs.appendFileSync(RETRY_FILE, `${url}\n`);
};

const removeFromRetry = (url) => {
  let retries = getRetryUrls();
  retries = retries.filter((retryUrl) => retryUrl !== url);
  fs.writeFileSync(RETRY_FILE, retries.join("\n"));
};

// Get input from user
const getInput = (message) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(message, (input) => {
      rl.close();
      resolve(input.trim());
    });
  });

// Download media
const downloadMedia = async (item) => {
  const folder = "downloads/";
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const fileName = `${item.id}.mp4`;
  const filePath = folder + fileName;

  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow(`[!] File '${fileName}' already exists. Skipping`));
    return;
  }

  const downloadFile = fetch(item.url);
  const file = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    downloadFile.then((res) => {
      res.body.pipe(file);
      file.on("finish", async () => {
        file.close();
        try {
          // Push to Android after download completes
          await pushToAndroid(filePath);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      file.on("error", (err) => reject(err));
    });
  });
};

// Process URL to obtain video details
const getVideo = async (url) => {
  const idVideo = await getIdVideo(url);
  const API_URL = `https://api22-normal-c-alisg.tiktokv.com/aweme/v1/feed/?aweme_id=${idVideo}`;
  const request = await fetch(API_URL, {
    method: "OPTIONS",
    headers: new Headers(),
  });
  const body = await request.text();

  try {
    const res = JSON.parse(body);

    if (!res.aweme_list || !res.aweme_list[0] || res.aweme_list[0].aweme_id !== idVideo) {
      console.error("Error: Video not found or deleted.");
      return null;
    }

    const video = res.aweme_list[0].video;
    const urlMedia = video.play_addr?.url_list[0] || null;

    return { url: urlMedia, id: idVideo };
  } catch (err) {
    console.error("Error parsing JSON:", err);
    logRetry(url);
    return null;
  }
};

// Extract video ID from URL
const getIdVideo = async (url) => {
  const resolvedUrl = await getRedirectUrl(url);
  const idMatch = resolvedUrl.match(/\/video\/(\d{19})/);

  return idMatch ? idMatch[1] : null;
};

// Resolve redirected URL
const getRedirectUrl = async (url) => {
  if (url.includes("vm.tiktok.com") || url.includes("vt.tiktok.com")) {
    const response = await fetch(url, { redirect: "manual" });
    return response.headers.get('location') || url;
  }
  return url;
};

// Main function
(async () => {
  console.log(chalk.blue("Welcome to TikTok Video Downloader"));

  try {
    await checkAdbConnection();
    console.log(chalk.green("[+] Android device connected successfully"));
  } catch (error) {
    console.log(chalk.red("[X] Error: " + error.message));
    process.exit(1);
  }

  while (true) {
    const urlInput = await getInput("Enter TikTok URL (or type 'exit' to quit): ");
    if (urlInput.toLowerCase() === 'exit') break;

    const videoUrl = await getRedirectUrl(urlInput);
    const data = await getVideo(videoUrl);

    if (data) {
      await downloadMedia(data)
        .then(() => {
          console.log(chalk.green("[+] Downloaded and pushed to Android successfully"));
          removeFromRetry(videoUrl);
        })
        .catch((err) => console.log(chalk.red("[X] Error: " + err)));
    }
  }

  console.log(chalk.green("Exiting program."));
})();