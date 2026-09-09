import express from "express";
import cors from "cors";
import multer from "multer";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const app = express();
const PORT = process.env.PORT || 10000;

const ROOT = process.cwd();
const DATA_ROOT = path.join(
  os.tmpdir(),
  "playmaker-data"
);

fs.mkdirSync(DATA_ROOT, {
  recursive: true
});

app.use(cors());

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  "/files",
  express.static(DATA_ROOT)
);


/* =========================
   기본 화면
========================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      ROOT,
      "index.html"
    )
  );

});


app.get("/health", (req, res) => {

  res.json({
    status: "healthy",
    ffmpeg: !!ffmpegPath,
    port: PORT
  });

});


/* =========================
   공통 함수
========================= */

function validProjectId(projectId) {

  return (
    typeof projectId === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(projectId)
  );

}


function projectDir(projectId) {

  if(!validProjectId(projectId)) {

    throw new Error(
      "잘못된 프로젝트 ID입니다."
    );

  }

  const dir =
    path.join(
      DATA_ROOT,
      projectId
    );

  fs.mkdirSync(
    dir,
    {
      recursive: true
    }
  );

  return dir;
}


function projectJsonPath(projectId) {

  return path.join(
    projectDir(projectId),
    "project.json"
  );

}


function readProject(projectId) {

  try {

    const file =
      projectJsonPath(projectId);

    if(!fs.existsSync(file)) {

      return {};
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  } catch(error) {

    console.error(
      "PROJECT READ ERROR:",
      error
    );

    return {};
  }

}


function writeProject(
  projectId,
  data
) {

  const file =
    projectJsonPath(
      projectId
    );

  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );


  fs.writeFileSync(
    path.join(
      DATA_ROOT,
      "latest-project.txt"
    ),
    projectId,
    "utf8"
  );

}


function latestProjectId() {

  const file =
    path.join(
      DATA_ROOT,
      "latest-project.txt"
    );

  if(!fs.existsSync(file)) {

    return "";
  }

  return fs
    .readFileSync(
      file,
      "utf8"
    )
    .trim();

}


function removeIfExists(file) {

  try {

    if(
      file &&
      fs.existsSync(file)
    ) {

      fs.unlinkSync(file);
    }

  } catch(error) {

    console.error(
      "FILE DELETE ERROR:",
      error
    );

  }

}


/* =========================
   프로젝트 저장 / 복원
========================= */

app.post(
  "/api/project/save",
  (req, res) => {

    try {

      const incoming =
        req.body || {};

      const projectId =
        incoming.projectId;

      if(
        !validProjectId(
          projectId
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "프로젝트 ID가 없습니다."
          });

      }


      const oldData =
        readProject(
          projectId
        );


      const merged = {
        ...oldData,
        ...incoming,
        projectId
      };


      writeProject(
        projectId,
        merged
      );


      res.json({
        ok: true,
        project: merged
      });

    } catch(error) {

      console.error(
        "PROJECT SAVE ERROR:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "프로젝트 저장 실패",
          detail:
            error.message
        });

    }

  }
);


app.get(
  "/api/project",
  (req, res) => {

    try {

      const projectId =
        latestProjectId();

      if(!projectId) {

        return res.json({});
      }


      const project =
        readProject(
          projectId
        );


      res.json(
        project
      );

    } catch(error) {

      console.error(
        "PROJECT LOAD ERROR:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "프로젝트 불러오기 실패",
          detail:
            error.message
        });

    }

  }
);


/* =========================
   파일 업로드 설정
========================= */

const upload =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        100 * 1024 * 1024
    }

  });


/* =========================
   MP3 서버 저장
========================= */

app.post(
  "/api/project/audio",
  upload.single("audio"),
  (req, res) => {

    try {

      const projectId =
        req.body.projectId;

      if(
        !validProjectId(
          projectId
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "프로젝트 ID가 없습니다."
          });

      }


      if(!req.file) {

        return res
          .status(400)
          .json({
            error:
              "MP3 파일이 없습니다."
          });

      }


      const dir =
        projectDir(
          projectId
        );


      const audioPath =
        path.join(
          dir,
          "audio.mp3"
        );


      fs.writeFileSync(
        audioPath,
        req.file.buffer
      );


      const audioUrl =
        `/files/${projectId}/audio.mp3`;


      const oldData =
        readProject(
          projectId
        );


      const updated = {
        ...oldData,
        projectId,
        audioUrl,
        audioName:
          req.file.originalname
      };


      writeProject(
        projectId,
        updated
      );


      console.log(
        "MP3 SAVED:",
        projectId,
        req.file.originalname
      );


      res.json({
        ok: true,
        audioUrl,
        audioName:
          req.file.originalname
      });

    } catch(error) {

      console.error(
        "AUDIO UPLOAD ERROR:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "MP3 저장 실패",
          detail:
            error.message
        });

    }

  }
);


/* =========================
   썸네일 서버 저장
========================= */

app.post(
  "/api/project/thumbnail",
  upload.single("thumbnail"),
  (req, res) => {

    try {

      const projectId =
        req.body.projectId;

      if(
        !validProjectId(
          projectId
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "프로젝트 ID가 없습니다."
          });

      }


      if(!req.file) {

        return res
          .status(400)
          .json({
            error:
              "썸네일 파일이 없습니다."
          });

      }


      let extension =
        ".png";


      if(
        req.file.mimetype ===
        "image/jpeg"
      ) {

        extension = ".jpg";
      }


      if(
        req.file.mimetype ===
        "image/webp"
      ) {

        extension = ".webp";
      }


      const dir =
        projectDir(
          projectId
        );


      [
        "thumbnail.png",
        "thumbnail.jpg",
        "thumbnail.webp"
      ].forEach(name => {

        removeIfExists(
          path.join(
            dir,
            name
          )
        );

      });


      const filename =
        "thumbnail" +
        extension;


      const imagePath =
        path.join(
          dir,
          filename
        );


      fs.writeFileSync(
        imagePath,
        req.file.buffer
      );


      const thumbnailUrl =
        `/files/${projectId}/${filename}`;


      const oldData =
        readProject(
          projectId
        );


      const updated = {
        ...oldData,
        projectId,
        thumbnailUrl
      };


      writeProject(
        projectId,
        updated
      );


      console.log(
        "THUMBNAIL SAVED:",
        projectId,
        filename
      );


      res.json({
        ok: true,
        thumbnailUrl
      });

    } catch(error) {

      console.error(
        "THUMBNAIL UPLOAD ERROR:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "썸네일 저장 실패",
          detail:
            error.message
        });

    }

  }
);


/* =========================
   영상 자동 제작
========================= */

app.post(
  "/api/project/render",
  async (req, res) => {

    try {

      const projectId =
        req.body.projectId;


      if(
        !validProjectId(
          projectId
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "프로젝트 ID가 없습니다."
          });

      }


      const data =
        readProject(
          projectId
        );


      if(!data.audioUrl) {

        return res
          .status(400)
          .json({
            error:
              "저장된 MP3가 없습니다."
          });

      }


      if(!data.thumbnailUrl) {

        return res
          .status(400)
          .json({
            error:
              "저장된 썸네일이 없습니다."
          });

      }


      if(!ffmpegPath) {

        return res
          .status(500)
          .json({
            error:
              "FFmpeg를 찾을 수 없습니다."
          });

      }


      const dir =
        projectDir(
          projectId
        );


      const audioPath =
        path.join(
          dir,
          "audio.mp3"
        );


      const thumbnailName =
        path.basename(
          data.thumbnailUrl
        );


      const thumbnailPath =
        path.join(
          dir,
          thumbnailName
        );


      if(
        !fs.existsSync(
          audioPath
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "MP3 파일이 서버에 없습니다."
          });

      }


      if(
        !fs.existsSync(
          thumbnailPath
        )
      ) {

        return res
          .status(400)
          .json({
            error:
              "썸네일 파일이 서버에 없습니다."
          });

      }


      const outputPath =
        path.join(
          dir,
          "final.mp4"
        );


      removeIfExists(
        outputPath
      );


      console.log(
        "VIDEO RENDER START:",
        projectId
      );


const args = [
  "-y",

  "-loop", "1",
  "-framerate", "1",
  "-i", thumbnailPath,

  "-i", audioPath,

  "-vf",
  "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",

  "-c:v", "libx264",
  "-preset", "ultrafast",
  "-tune", "stillimage",
  "-r", "1",

  "-c:a", "aac",
  "-b:a", "128k",

  "-shortest",
  "-movflags", "+faststart",

  outputPath
];


      const result =
        await runFFmpeg(
          args
        );


      if(
        !fs.existsSync(
          outputPath
        )
      ) {

        throw new Error(
          "MP4 파일이 생성되지 않았습니다."
        );
      }


      const videoUrl =
        `/files/${projectId}/final.mp4`;


      const updated = {
        ...data,
        projectId,
        videoUrl
      };


      writeProject(
        projectId,
        updated
      );


      console.log(
        "VIDEO RENDER SUCCESS:",
        projectId
      );


      res.json({
        ok: true,
        videoUrl,
        ffmpegLog:
          result.slice(-1500)
      });

    } catch(error) {

      console.error(
        "VIDEO RENDER ERROR:",
        error
      );

      res
        .status(500)
        .json({
          error:
            "영상 제작에 실패했습니다.",
          detail:
            error.message
        });

    }

  }
);


/* =========================
   FFmpeg 실행
========================= */

function runFFmpeg(args) {

  return new Promise(
    (resolve, reject) => {

      let stderr = "";


      const ffmpeg =
        spawn(
          ffmpegPath,
          args
        );


      ffmpeg.stderr.on(
        "data",
        chunk => {

          const text =
            chunk.toString();

          stderr += text;

          console.log(
            text.trim()
          );

        }
      );


      ffmpeg.on(
        "error",
        error => {

          reject(
            new Error(
              "FFmpeg 실행 오류: " +
              error.message
            )
          );

        }
      );


      ffmpeg.on(
        "close",
        code => {

          if(code === 0) {

            resolve(
              stderr
            );

          } else {

            console.error(
              "FFMPEG EXIT CODE:",
              code
            );


            reject(
              new Error(
                "FFmpeg 종료 코드 " +
                code +
                "\n" +
                stderr.slice(-3000)
              )
            );

          }

        }
      );

    }
  );

}


/* =========================
   404
========================= */

app.use(
  (req, res) => {

    res
      .status(404)
      .json({
        error:
          "존재하지 않는 주소입니다."
      });

  }
);


/* =========================
   서버 시작
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "PlayMaker server running on port",
      PORT
    );

    console.log(
      "FFmpeg path:",
      ffmpegPath
    );

    console.log(
      "Data root:",
      DATA_ROOT
    );

  }
);
