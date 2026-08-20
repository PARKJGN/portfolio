---
title: oneBite
order: 1
spine:
  color: ink
  height: tall
  width: wide
year: '2026'
summary: 관심 카테고리를 고르면 매일 아침 AI 가 요약한 뉴스레터를 보내주는 서비스입니다.
---

## 무엇을 만들었나

관심 있는 카테고리를 조합해 구독해 두면, 매일 오전 8시에 AI 가 요약한 뉴스레터를
푸시로 받아보는 모바일·웹 서비스입니다. 백엔드부터 앱, 웹, 인프라까지 혼자
설계하고 만들었습니다.

## 직접 보기

- [onebite.jgbak-land.com](https://onebite.jgbak-land.com)
- iOS · Android 앱 — 출시 예정

## 어떻게 만들었나

- 백엔드는 Kotlin 과 Spring Boot 로 헥사고날 아키텍처를 잡고 JPA·PostgreSQL·Flyway 를
  올렸습니다. 푸시 팬아웃은 Kafka 로 비동기 처리합니다.
- 인증은 JWT 액세스 토큰 30분 + 회전형 리프레시 토큰 30일의 무상태 구조로 만들고,
  401 이 오면 클라이언트가 알아서 재발급받게 했습니다.
- RSS 수집 → Claude 로 요약 → 에디션 생성 → APNs/FCM 발송을 n8n 배치가 15분 주기로
  오케스트레이션합니다.
- 앱은 React Native 에 Zustand·TanStack Query 를, 웹은 Next.js 를 썼습니다.
  Google·Kakao·Naver 소셜 로그인 3종을 붙였습니다.

## 무엇을 고민했나

같은 카테고리 조합을 구독한 사람이 여럿이면 요약도 여러 번 돌아야 할까.
그렇지 않게 하려고 에디션을 (카테고리 조합 · 언어 · 발행일) 단위로 만들어 공유하게
설계했습니다. 덕분에 LLM 호출이 사용자 수와 무관하게 조합당 하루 한 번으로 고정되고,
같은 내용을 두 번 만드는 일이 없습니다.

배포는 라즈베리파이 ARM64 3노드 쿠버네티스 클러스터에 올렸습니다. amd64/arm64
멀티아치 이미지를 GitHub Actions 로 굽고, 기동이 90초쯤 걸리는 문제는 startupProbe 로
받아냈습니다. App Store 와 Google Play 출시는 EAS 빌드부터 아이콘·정책 문서·심사
준비까지 직접 했고, 지금은 출시를 앞두고 있습니다.
