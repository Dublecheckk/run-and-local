# 런앤로컬 · 생활 목적지 러닝

오늘 어차피 가야 하는 목적지까지의 이동을 사용자의 시간·거리·페이스에 맞는 러닝으로 전환하는 공익적 러닝 챌린지입니다. 현재는 **서울 성수·서울숲·뚝섬 실증권역**만 지원합니다.

카카오 장소 검색으로 목적지를 입력하고, OpenStreetMap 보행망에서 실제 경로를 생성합니다. 정해진 예시 코스의 점수만 바꾸는 방식이 아닙니다.

## 실행과 검증

Node.js 24를 권장합니다.

```bash
npm ci
npm run dev
npm run lint
npm test
npm run build
```

카카오 검색에는 `KAKAO_REST_API_KEY`가 필요합니다. 키가 없거나 API가 실패하면 저장된 POI를 보조 목록으로 사용합니다. 배경지도 타일은 인터넷 연결이 필요합니다.

## 주요 흐름

1. 출발지를 검색·현위치·지도에서 선택합니다.
2. 오늘 가야 하는 식사·쇼핑·문화·생활 목적지를 먼저 검색합니다.
3. 목적지가 없을 때만 생활·쇼핑·저녁 약속·문화생활 미션으로 장소를 추천합니다.
4. 목표 거리·페이스·시간·코스 형태·테마·제외 조건을 적용합니다.
5. 보행망 연결·시간·거리 조건을 통과한 코스만 최대 3개 보여줍니다.

## Destination Type과 Context prior

카카오 카테고리를 `MEAL`, `SHOPPING`, `DAILY_ERRAND`, `CULTURE_LEISURE`, `SOCIAL_NIGHT`, `SPORTS_WELLNESS`, `CAFE_DESSERT`로 분류합니다. `REVIEW`와 `EXCLUDE`는 장소 추천에서 제외합니다.

신한카드 Destination Type 분석은 개인 이동이나 선호를 예측하는 모델이 아닙니다. 서울 집계 소비패턴은 미션 메뉴 구성과, 필수 경로 조건을 통과한 추천 후보의 보조 정렬에만 사용합니다. Context 보너스는 최대 5점이며 사용자가 목적지를 직접 고른 경우 경로 점수에 적용하지 않습니다.

성별·연령대는 선택 항목으로 기기에만 저장합니다. 현재는 소비 군집을 개인 선호로 판단하지 않으며, 데이터분석팀의 4개 군집 매핑이 제공된 뒤에도 약한 보조값으로만 연결합니다.

## 데이터와 한계

- `public/data/seongsu.json`: 성수·서울숲·뚝섬 실증권역 보행 도로망
- `lib/destination-context.ts`: Destination Type, 미션 라벨, Context prior
- `lib/recommender.ts`: 경로 탐색·하드 제약·순위 계산
- `tests/seongsu-coverage.ts`: 실증권역 도로망 연결성 검증
- `tests/destination-context.ts`: 분류·미션 라벨·보조점수 상한 검증

실제 상점 입구·영업 여부·공사·야간 조명·현장 통행 가능 여부는 방문 전 확인해야 합니다. 추천 점수는 안전·성공 확률이 아닙니다.

지도 데이터: © OpenStreetMap contributors, ODbL 1.0. [라이선스](https://www.openstreetmap.org/copyright), [생성 기록](DATA.md).
