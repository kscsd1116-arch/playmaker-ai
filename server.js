import express from "express";
import cors from "cors";
import multer from "multer";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(process.cwd()));

const upload = multer({
  dest: path.join(os.tmpdir(), "playmaker-uploads"),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});


app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});


app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    ffmpeg: !!ffmpegPath
  });
});


app.post(
  "/render-video",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {

    let audioPath = null;
    let imagePath = null;
    let outputPath = null;

    try {

      const audioFile =
        req.files?.audio?.[0];

      const imageFile =
        req.files?.image?.[0];

      if (!audioFile || !imageFile) {

        return res.status(400).json({
          error: "MP3와 썸네일 이미지가 모두 필요합니다."
        });

      }

      audioPath = audioFile.path;
      imagePath = imageFile.path;

      const id =
        crypto.randomBytes(8).toString("hex");

      outputPath =
        path.join(
          os.tmpdir(),
          `playmaker-${id}.mp4`
        );


      const args = [

        "-y",

        "-loop",
        "1",

        "-i",
        imagePath,

        "-i",
        audioPath,

        "-c:v",
        "libx264",

        "-tune",
        "stillimage",

        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",

        "-c:a",
        "aac",

        "-b:a",
        "192k",

        "-shortest",

        "-movflags",
        "+faststart",

        "-r",
        "30",

        outputPath

      ];


      const ffmpeg =
        spawn(ffmpegPath, args);


      let ffmpegError = "";


      ffmpeg.stderr.on(
        "data",
        data => {

          ffmpegError +=
            data.toString();

        }
      );


      ffmpeg.on(
        "error",
        error => {

          cleanupFiles(
            audioPath,
            imagePath,
            outputPath
          );

          if (!res.headersSent) {

            res.status(500).json({
              error:
                "FFmpeg 실행에 실패했습니다.",
              detail:
                error.message
            });

          }

        }
      );


      ffmpeg.on(
        "close",
        code => {

          if (code !== 0) {

            cleanupFiles(
              audioPath,
              imagePath,
              outputPath
            );

            if (!res.headersSent) {

              return res.status(500).json({
                error:
                  "영상 제작에 실패했습니다.",
                detail:
                  ffmpegError.slice(-1500)
              });

            }

            return;

          }


          if (!fs.existsSync(outputPath)) {

            cleanupFiles(
              audioPath,
              imagePath,
              outputPath
            );

            return res.status(500).json({
              error:
                "완성된 영상 파일을 찾을 수 없습니다."
            });

          }


          res.download(
            outputPath,
            "PlayMaker-video.mp4",
            error => {

              cleanupFiles(
                audioPath,
                imagePath,
                outputPath
              );

              if (
                error &&
                !res.headersSent
              ) {

                res.status(500).json({
                  error:
                    "영상 다운로드에 실패했습니다."
                });

              }

            }
          );

        }
      );


    } catch (error) {

      cleanupFiles(
        audioPath,
        imagePath,
        outputPath
      );

      res.status(500).json({
        error:
          "서버 오류가 발생했습니다.",
        detail:
          error.message
      });

    }

  }
);


function cleanupFiles(...files) {

  for (const file of files) {

    if (
      file &&
      fs.existsSync(file)
    ) {

      try {
        fs.unlinkSync(file);
      } catch {
      }

    }

  }

}


const PORT =
  process.env.PORT || 3000;


app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `PlayMaker server running on port ${PORT}`
    );

  }
);
