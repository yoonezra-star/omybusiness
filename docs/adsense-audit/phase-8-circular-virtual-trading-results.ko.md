# 8단계: 자원화·가상 환경·트레이딩 보강

작업일: 2026년 10월 13일. ID 58·55·53을 같은 주소에서 개정했다. 누적 27편 개정, 추가 검토 55편이다. 개정 수·분량·내부 검사는 Google의 평가 점수나 승인 확률이 아니다.

## 편집 결정

| ID | 개정 범위 | 제거한 미확인 주장 | 자체 분석 |
| --- | --- | --- | --- |
| 58 | 물질 수지·제품 규격·판매 가치 | 프로젝트 경험·전 공장 자급 순환·COTC와 폐기물 성과 혼합·공통 경제성·수익 보장 | 투입/회수/적합품 분모, 인증 범위, 미판매량에 따른 조건부 비용 |
| 55 | VR·AR·트윈과 교육 성과 | 현장 방문·회사 공통 훈련·무위험·자동 숙련·고장 예측·발주 일화 | 용도/실제 제어 구분, 수료/가상/현실 평가 분모, 내용 사용 기간과 비용 |
| 53 | 거래량·물류·가격 영향 | 트레이더/전문가 인터뷰·개인 관찰·비공개 거래 정보·무손실·투자 수익 | 공시 단위/기간/주체, 인도 비용, 불완전한 가격 상쇄, 상관과 인과 |

58은 [Aramco Europe의 원유 전환 소개](https://europe.aramco.com/en/what-we-do/energy-innovation/advancing-energy-solutions/crude-oil-to-chemicals)의 기술 범위만 사용했다. 과거 전망·연구 목표를 현재 수율로 표시하지 않는다. [2023년 공동 발표](https://totalenergies.com/newsroom/totalenergies-aramco-and-sabic-complete-mena-regions-first-processing-oil/?lang=eng)의 폐플라스틱 유래 원료와 SATORP·Petrokemya 흐름, [폐기물 관리 페이지](https://www.aramco.com/en/sustainability/environment/waste-management)의 2024·2025 보고 지표, [ISCC PLUS 개요](https://iscc-system.org/certification/certification-schemes/iscc-plus/)의 관리 방법을 분리했다. 현재 개별 인증·배치 함량·환경 전 과정·실제 사업 이익은 검증하지 않았다. 제한적 보증 주석의 소개를 보증 보고서 전문 검토로 표시하지 않는다.

55는 [2020-05-06 VR-Zone 소개](https://www.aramco.com/en/news-media/elements-magazine/2020/a-brave-new-digital-world)를 직접 HTTP로 읽어 날짜·용도를 확인했다. 웹 도구의 재접속 시간 초과를 본문 부재로 판정하지 않았다. [현재 디지털 기술 페이지](https://www.aramco.com/en/what-we-do/energy-innovation/digitalization/digital-technologies)의 Hasbah·VR·AR·현장 협업 소개와 [NIST 논문 공개 초록](https://www.nist.gov/publications/credibility-consideration-digital-twins-manufacturing)의 용도·VVUQ 관점을 구분했다. 회사 교육 성적·전체 권한표·논문 전문·특정 모델의 적합성 심사를 확인했다고 표시하지 않았다.

53은 [2025 연차보고서 Results 원본 PDF](https://www.aramco.com/-/media/publications/corporate-reports/reports-and-presentations/2025/fy/sections/ara-2025-results-english.pdf)의 인쇄 62쪽을 추출하고 렌더링해 본문·그래프 단위를 확인했다. 검색 요약의 mbpd 표기를 그대로 사용하지 않았다. PDF 35번째 페이지가 대상이며 처음 렌더링한 36번째의 Power 페이지는 근거로 사용하지 않았다. [ATC 위험 관리 소개](https://www.aramcotrading.com/en/what-we-do/risk-management/)·[EIA 금융 시장 설명](https://www.eia.gov/finance/markets/crudeoil/financial_markets.php)·[2026 상반기 보고서](https://www.aramco.com/-/media/publications/corporate-reports/reports-and-presentations/2026/h1/saudi-aramco-h1-2026-interim-report-english.pdf)의 부문 정의를 서로 다른 근거로 연결했다. ATC 단독 이익·내부 포지션·현재 가격·회사 거래량의 시장 인과 효과는 검증하지 않았다.

표 9개·자체 설명 도식 2개·주장별 출처 11개를 추가했다. 실제 회사 보고값과 가상 계산을 구분했다. 기존 URL·원래 발행일·백업·주제 분류와 이전 24편의 본문은 유지했다. 미확인 개인 경력·현장 사진·회사 내부 도식을 만들거나 재사용하지 않았다. 현장 조작·인증 판정·투자 매매 지침도 제시하지 않는다.

## 계산·정적 검사

- `npm.cmd test` 통과. 본문·출처·앵커·표 구조·작성자·목록·사이트맵 검사 포함.
- UTC 빌드 검사도 통과. 개정 시각 `2026-10-13T00:22:55+09:00`와 한국 날짜 표시 일치.
- 2024·2025 폐기물 재활용률의 차이 21.3%포인트. 화학제품 수율·절대 톤 수 변화로 바꾸지 않는다.
- 가상 수지 60+20+20=100t, 투입 대비 회수 80%·적합품 60%·회수물 중 적합품 75% 검사 통과.
- 가상 판매 순효과 60,000+10,000-65,000=5,000달러, 40t 판매 시 -15,000달러. 생산 수율 변화가 아닌 미판매 가정이다.
- 가상 교육 90/95≈94.7%, 전체 가상 통과 90%, 별도 현실 과제 통과 80%. 어느 값도 사고 예방률·직무 자격이 아니다.
- 가상 연간 비용은 같은 현실 평가를 양쪽에 포함해 대면 70,000·VR 65,000달러. 내용 사용 기간을 3년→1년으로 바꾸면 VR 105,000달러.
- 공시 반올림 거래량 7.3→7.4mmbpd의 변화 약 1.4%. 세계 점유율·유가 변화·이익률이 아니다.
- 가상 실물 거래 잔액 74,000-70,000-3,500=500달러, 판매 단가 1달러 낮으면 -500달러.
- 가상 가격 변화 -12,000+10,000=-2,000달러. 비용 제외·불완전 상쇄의 예시이며 실제 헤지 전략이 아니다.
- 변경 대상 외 79편 본문 해시 `ab47b7c2d29e1d1785300e1325d84b497e4bb894d03b3da335fd7f391eea14ec` 일치.
- 미개정 55편 본문·canonical 해시 `34a30cb6f1b61cb2dfe04a714fb1dbdaf820e40b472e3e441d3507a1eeee9a87` 일치.
- 원본 `data/posts.json` 해시 `fa29f9a46c0134ca02891028d7140cd2097231c4be0d8f9a013fcc4658764168` 일치.
- 생성 HTML 111개·내부 링크 4,413개·로컬 이미지/스타일/스크립트 참조 586개, 누락 0개.
- 본문 공백 제외 58 2,839자·55 2,683자·53 2,677자. Google의 최소 분량 요구로 해석하지 않는다.

## 로컬 브라우저 검사

- 기존 미리보기 `http://127.0.0.1:8787/`에서 HTTP 200 확인. 기존 Codex 브라우저 탭 재사용.
- 3편 × 1440×1000·768×1024·390×844·360×800의 12개 조합에서 제목·페이지 가로 넘침 없음. 모바일 도식은 단일 열, 표는 자체 스크롤 영역이다.
- 모바일 표 9개의 키보드 가로 이동·출처 목차의 올바른 hash·개정 기록 펼침 확인. 화면 이동 중간 값과 최종 위치를 구분하며 모든 출처 제목의 고정 위치를 보장한다고 표시하지 않는다.
- PC 도식·표와 모바일 제목·표의 실제 캡처를 열어 보았다. 콘솔 오류 로그 0건. 모바일 거래량 단위가 갈라지는 모습을 발견해 해당 4개 값에만 `.quantity`의 줄바꿈 방지를 적용했다. 다른 본문·브라우저 스크립트는 변경하지 않았다. 수정 후 레이아웃을 다시 검사한다.
- 증거·캡처·메트릭은 `C:/Users/yoone/.codex/visualizations/2026/10/13/omybusiness-circular-virtual-trading/`에 보관한다. 전체 접근성·교차 브라우저 전수 검사 완료를 뜻하지 않는다.

## 배포

본문 배포와 공개 사이트 일치 여부는 확인 후 이 기록에 추가한다.

## 다음 순서

원래 우선 검토 목록의 미개정 P0 4편·P1 51편이 남았다. 오류 확정 건수가 아니라 검토 순위다. 다음 묶음은 드론 점검(50)·에너지 저장(49)·Jazan 정유(39), 이후 저류층 시뮬레이션(18)을 검토한다.

추가 55편과 이미지 권리·중복 표준 URL·검색 수요 등 남은 검토 전에는 90점 달성·승인 준비 완료를 선언하지 않는다. AdSense 재심사·티스토리 일괄 삭제나 비공개는 실행하지 않았다.
