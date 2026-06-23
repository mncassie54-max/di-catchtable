# DI 점심 맛집

DI 팀이 점심 맛집을 등록·필터·삭제하고 실시간으로 공유하는 단일 페이지 웹앱.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가".
2. 프로젝트 생성 후 좌측 **빌드 > Firestore Database** → "데이터베이스 만들기".
3. 위치 선택. 시작 모드는 무엇을 골라도 되며, **곧바로 4번에서 영구 규칙으로 덮어쓴다**.
   - ⚠️ "테스트 모드"는 read/write가 **30일 후 만료**되니, 만료 없이 계속 쓰려면 반드시 4번을 적용한다.
4. **만료 없는 영구 규칙 적용** — Firestore Database > **규칙(Rules)** 탭으로 가서
   내용을 아래(저장소의 [`firestore.rules`](firestore.rules)와 동일)로 통째로 바꾸고 **게시(Publish)**:
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
   이 규칙에는 날짜 만료 조건이 없어서 계속 동작한다. (테스트 모드 기본 규칙에는
   `request.time < timestamp.date(...)` 같은 만료 조건이 들어 있어 30일 뒤 막힌다.)
5. 프로젝트 설정(⚙️) > **일반** 탭 > "내 앱"에서 **웹 앱(</>)** 추가.
6. 표시되는 `firebaseConfig` 값을 복사.

## 2. 설정값 넣기

`firebase-config.js`의 `firebaseConfig` 객체를 위에서 복사한 값으로 교체한다.

## 3. 카카오맵 설정 (지도 기능)

메인 지도와 등록 시 위치 검색은 카카오맵을 사용한다. JavaScript 키가 필요하다(무료).

1. https://developers.kakao.com 접속 → 로그인 → **내 애플리케이션 > 애플리케이션 추가하기**.
2. 앱 생성 후 **앱 설정 > 앱 키**에서 **JavaScript 키**를 복사.
3. **앱 설정 > 플랫폼 > Web**에서 사용할 도메인을 **사이트 도메인**으로 등록:
   - 로컬 테스트용: `http://localhost:4321`
   - 배포용: `https://<계정>.github.io` (Pages 주소의 도메인 부분)
4. `map-config.js`의 `KAKAO_APP_KEY`를 복사한 JavaScript 키로 교체.

> 키를 채우지 않아도 나머지 기능(등록·필터·삭제)은 정상 동작하며, 지도 자리에는 안내 문구만 표시된다.
> 회사 기본 위치는 `map-config.js`의 `COMPANY`에서 조정할 수 있다.

## 4. 로컬 실행

ES module은 `file://`에서 제한될 수 있으니 로컬 서버로 연다.

```bash
npx serve . -l 4321
```

표시된 주소(http://localhost:4321)로 접속. (카카오 도메인 등록을 이 포트에 맞췄다)

## 5. GitHub Pages 배포

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
- `firebaseConfig`의 apiKey와 카카오 JavaScript 키는 공개되어도 되는 클라이언트 식별자다. 접근 통제는 Firestore 보안 규칙과 카카오 도메인 등록으로 한다.
