# 이티링크 현장 관리 앱 — 인수인계 (새 대화 시작용)

새 대화에서 이 파일을 먼저 읽고 시작한다. 이 저장소가 유일한 원본이다.

## 구성
| 항목 | 위치 |
|---|---|
| 배포 앱 (PWA) | https://axell92.github.io/etlink-app/ — `index.html`, `sw.js`, `manifest.webmanifest`, 아이콘 |
| 앱 원본 | `src/Index.template.html` — placeholder `__SEED__ __PSEED__ __SSEED__ __API_URL__` |
| 빌드 | `python3 src/build.py` → `index.html` (배포) / `--preview` → `preview.html` (시드 데이터, API 없음) |
| 백엔드 | `src/Code.gs` — Google Apps Script 웹앱 (JSON API). 수정 시 사용자가 Apps Script에 붙여넣고 **배포 관리 → 새 버전** 필요 |
| DB | Google Sheets: 시트 `sites / people / instruments / standards / log`. 열 순서 = Code.gs `SCHEMA` |
| 기준표 데이터 | `src/standards/standards.json` (작업용 사본) → `xlsx_from_json.py` → `standards_시트용.xlsx` → 사용자가 시트에 붙여넣기 |
| 설치·운영 가이드 | `src/설치가이드.md` |
| 미리보기 아티팩트 | claude.ai 아티팩트 slug `e23832fd-8cdd-4f14-a285-b10786379c61` (preview.html 발행) |

## 배포 절차 (앱 수정)
0. 기능·화면 변경은 미리보기 아티팩트 갱신 → 사용자 OK → push. 오타·문구 수준은 바로 push (main push = 즉시 실배포)
1. `src/Index.template.html` 수정 → `python3 src/build.py` → `index.html` 생성
2. 커밋 → `main` push → GitHub Actions(`.github/workflows/pages.yml`)가 Pages 배포 (1~2분)
3. 사용자는 앱 새로고침만 (sw.js는 network-first, 캐시 안 씀). 큰 변경이면 `sw.js`의 CACHE 이름 올리기
4. Code.gs를 바꿨으면 사용자에게 파일 전달 + "배포 관리 → 새 버전" 안내

## 기준표 ([기준] 탭) 규칙 — 반드시 지킬 것
- **원본은 Google Sheet `standards` 탭.** 사용자가 시트에서 직접 문구를 고친다. 전체 덮어쓰기 xlsx는 사용자가 "아직 시트 수정 안 했다"고 확인했을 때만. 평소엔 **추가 행만** 별도 xlsx(`standards_추가_*.xlsx`)로 전달 → 시트 맨 아래 붙여넣기 (`id` 비워두면 서버가 채움)
- 큰 개편이 필요하면 시트를 내보내 받아서 `standards.json`을 갱신한 뒤 작업
- 열: `id, order, cat, equip, item, sub, stage, kr_std, kr_crit, intl_std, intl_crit, note, tag, updated`
- `cat`(분류)은 **시험 종류**만. 장비명·"형식시험"·"특성시험" 같은 단계/장비 축 금지. 현재 18개:
  절연저항 · 절연내력 · 접촉·접속저항 · 열화상 · 접지·본딩 · 전기 특성 · 전력품질 · 효율 · 부하·온도상승 · 부하·과도응답 · 보호장치·계전기 · 절체·기동 · 병렬운전 · 배터리 · 정격·내력 · 소음·진동 · 감시·보조계통 · 계측기
- `equip`: 공통 · 변압기 · 발전기 · UPS · ATS · CTTS · ATS·CTTS · SWGR · 부스덕트 · PDU · REC(정류기) · NGR · 케이블
- `sub`: **값이 달라지는 조건**으로만 분기 (저압/고압, 유입/건식, 저압반/고압반, 도금 종류 등). 길이 때문에 쪼개지 않음
- **국내/국제, KEC/IEC를 분류·경로 레벨로 올리지 말 것.** 모든 잎은 국내 블록 + 국제 블록을 둘 다 가진다. KS C IEC = IEC 동일 규격이면 국내에 전문, 국제는 "(KS와 동일) / 동일"
- `stage`: **L1 ~ L4만** (L1 공장/성적서, L2 비가압 설치검사, L3 가압·기동, L4 부하). 복합은 `L1·L2` `L2·L3` `L3·L4` `L1·L4`. L5/IST 없음 — 통합 시나리오는 기준이 아님, 장비별 성능으로만 판정
- `tag`: 법정 · 통상 · 없음(국내 기준 없음) · 확인(출처/판 미확인)
- 용어: 절환/전환 → **절체** (단, 탭절환기는 장치명이라 예외). 미배정 → 사무실
- 제외하기로 한 것: 케이블 VLF·tan δ·현장 PD·시스시험·특고압 IR(검사기관 영역), 절연유 BDV, 유입변압기 표면 열화상 절대온도, EMC, L5 통합시험 행
- 본문 작성 팁: `kr_crit`/`intl_crit`는 " · "로 항목 구분, ". "로 문장 구분 — 앱이 줄 단위로 쪼개 표시(세그먼트 3개 이상이면 줄바꿈)

## 앱 구조 요약 (Index.template.html)
- 탭: 현장 · 인원 · 측정기 · 기준. 모바일 우선, 라이트+약간 고대비, SVG 아이콘
- 데이터: `data={sites,people,instruments,standards}`, 클라이언트 생성 id(8hex), 낙관적 저장 + 순차 큐, 서버는 변경된 시트만 반환(`part_`)
- 측정기: typeKey = name|baseModel, 교정 만료/≤30일 임박 표시. 인원: 직급 순, 부서별 그룹, 장기휴가 상태(status/status_until)
- 현장 상세·배정/이동 선택기: 그룹 기본 접힘, 검색 중에만 펼침
- 기준 탭: 시험별/장비별 전환, 검색(전 필드), 접힌 그룹 → 잎 → 상세 모달(국내 블록 → 국제 블록 → 주의)
- PIN: Script Property `PIN` 설정 시 쓰기 보호. 사용자가 켜는 중 — 켜졌으면 이 줄을 "ON"으로 고칠 것

## 보안
- `src/people_seed.json`·`seed_min.json`은 **가짜 시드**다. 실제 인원·측정기 데이터는 Google Sheet에만 있다. 실데이터를 저장소에 커밋하지 말 것 (공개 저장소)
- 쓰기 보호: Apps Script 스크립트 속성 `PIN` 설정 시 앱이 PIN을 요구 — 켜 두는 것을 권장
- 저장소를 붙일 때 수정 작업이면 **push 권한**으로 붙일 것 (기본은 읽기 전용)
- 분류(cat)는 18개 — 가운뎃점(·)이 들어간 이름은 하나의 분류

## 사용자 (조승만 대리) 작업 방식
- 반말, 메커니즘 우선, 짧게. 결정이 필요하면 선택지와 추천을 같이. 추측은 "확인 필요"로 표시하고 단정하지 않기
- 변경 후: 미리보기 아티팩트 갱신 + 파일 전달 + 사용자가 할 일 번호로 간단히
