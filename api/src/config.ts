/**
 * 환경변수를 한 곳에서 읽고 검증한다.
 *
 * 없는 값이 있으면 **기동을 실패시킨다.** 절반만 설정된 채로 떠서 첫 요청에 500 을 내는
 * 것보다, 뜨지 않고 무엇이 없는지 말하는 편이 낫다. 쿠버네티스는 기동 실패를 재시작으로
 * 알려 주므로 잘못된 설정이 조용히 살아남지 않는다.
 */

export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  /**
   * 브라우저에서 이 API 를 부를 수 있는 출처들.
   *
   * 운영은 사이트 도메인 하나지만 로컬은 둘이다 — `next dev`(3000)와 빌드 결과를
   * 띄워 보는 정적 미리보기(4321). 쉼표로 나눠 적는다.
   */
  allowedOrigins: string[];
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  verdict: {
    apiKey: string;
    /** 이 시간을 넘으면 기다리지 않고 보류로 처리한다 (FR-013). */
    timeoutMs: number;
  };
  /** 보류함 조회·삭제에 쓰는 주인 토큰. */
  adminToken: string;
  /** 접속 식별값을 해시할 때 섞는 소금. 원문 주소는 저장하지 않는다 (FR-020). */
  clientHashSalt: string;
  rateLimit: {
    windowMs: number;
    max: number;
    /**
     * 순간 폭주 막이의 분당 상한. 위의 `max` 와 다르다 — 저쪽은 "한 사람이 한 시간에 몇 개
     * 남길 수 있나"(데이터베이스가 센다), 이쪽은 "초당 몇 번 두드릴 수 있나"(메모리가 센다).
     */
    burstMax: number;
  };
}

class MissingConfigError extends Error {
  constructor(names: string[]) {
    super(
      `환경변수가 없다: ${names.join(', ')}\n` +
        `api/.env.example 을 참고해 .env 를 채우거나, 운영이라면 Secret 을 확인할 것.`,
    );
    this.name = 'MissingConfigError';
  }
}

const missing: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    missing.push(name);
    return '';
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} 은 양수여야 한다. 받은 값: ${raw}`);
  }
  return parsed;
}

function readNodeEnv(): Config['nodeEnv'] {
  const raw = process.env['NODE_ENV'] ?? 'development';
  if (raw === 'development' || raw === 'production' || raw === 'test') return raw;
  throw new Error(`NODE_ENV 는 development·production·test 중 하나여야 한다. 받은 값: ${raw}`);
}

/**
 * 설정을 읽는다. 부르는 시점에 검증하므로 테스트에서 환경변수를 바꿔 가며 부를 수 있다.
 */
export function loadConfig(): Config {
  missing.length = 0;

  const config: Config = {
    port: optionalNumber('PORT', 8080),
    nodeEnv: readNodeEnv(),
    allowedOrigins: required('ALLOWED_ORIGIN')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o !== ''),
    db: {
      host: required('PGHOST'),
      port: optionalNumber('PGPORT', 5432),
      database: required('PGDATABASE'),
      user: required('PGUSER'),
      password: required('PGPASSWORD'),
    },
    verdict: {
      apiKey: required('ANTHROPIC_API_KEY'),
      // 기본값도 6초다. 운영에서 판정 한 번이 2.4~3.1초 걸려 4초로는 여유가 없었다
      // (측정 기록은 deploy/k8s/15-config.yaml).
      timeoutMs: optionalNumber('VERDICT_TIMEOUT_MS', 6000),
    },
    adminToken: required('ADMIN_TOKEN'),
    clientHashSalt: required('CLIENT_HASH_SALT'),
    rateLimit: {
      windowMs: optionalNumber('RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
      max: optionalNumber('RATE_LIMIT_MAX', 5),
      burstMax: optionalNumber('BURST_LIMIT_MAX', 30),
    },
  };

  if (missing.length > 0) throw new MissingConfigError(missing);

  // 짧은 토큰은 없는 것과 크게 다르지 않다. 주인만 닿아야 하는 자리다 (FR-018).
  if (config.adminToken.length < 32) {
    throw new Error('ADMIN_TOKEN 이 너무 짧다. openssl rand -hex 32 로 만들 것.');
  }
  if (config.clientHashSalt.length < 32) {
    throw new Error('CLIENT_HASH_SALT 가 너무 짧다. openssl rand -hex 32 로 만들 것.');
  }

  return config;
}
