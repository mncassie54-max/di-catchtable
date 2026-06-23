# DI 점심 맛집

DI 팀이 점심 맛집을 등록·필터·삭제하고 실시간으로 공유하는 단일 페이지 웹앱.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가".
2. 프로젝트 생성 후 좌측 **빌드 > Firestore Database** → "데이터베이스 만들기".
3. 위치 선택, **테스트 모드로 시작** 선택 (read/write 30일 허용).
   - 계속 쓰려면 규칙에서 아래처럼 공개 설정:
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /restaurants/{doc} {
           allow read, write: if true;
         }
       }
     }
     ```
4. 프로젝트 설정(⚙️) > **일반** 탭 > "내 앱"에서 **웹 앱(</>)** 추가.
5. 표시되는 `firebaseConfig` 값을 복사.

## 2. 설정값 넣기

`firebase-config.js`의 `firebaseConfig` 객체를 위에서 복사한 값으로 교체한다.

## 3. 로컬 실행

ES module은 `file://`에서 제한될 수 있으니 로컬 서버로 연다.

```bash
npx serve .
```

표시된 주소(예: http://localhost:3000)로 접속.

## 4. GitHub Pages 배포

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

GitHub 저장소 > **Settings > Pages** > Source를 `main` 브랜치 `/ (root)`로 설정 → 저장.
잠시 후 `https://<계정>.github.io/<저장소>/` 에서 접속 가능.

## 주의

- 페이지는 인터넷에 공개되며 누구나 등록/삭제할 수 있다(공용 점심 맛집 용도).
- `firebaseConfig`의 apiKey는 공개되어도 되는 클라이언트 식별자다. 접근 통제는 Firestore 보안 규칙으로 한다.
