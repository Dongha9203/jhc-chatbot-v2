'use strict';

/**
 * 함정 3종 차단 + 컴플라이언스 6항목 검증기
 * P2 RAG 엔진 핵심 안전장치
 */

// 화장품법 위반 표현 패턴
const COSM_LAW_VIOLATIONS = [
  /부작용.{0,10}(없|0|영)/,       // "부작용 없음" 단정
  /임산부.{0,10}(안전|가능|써도)/,  // 임산부 안전 단정
  /효과.{0,10}(보장|확실|100)/,    // 효과 보장 단정
  /(무조건|반드시).{0,10}(좋|효)/,  // 무조건 좋다
  /의학적.{0,10}(효능|치료|완치)/,  // 의료적 효능 주장
];

// 개인정보 패턴 (마스킹 필요)
const PII_PATTERNS = [
  { pattern: /\d{3}-\d{4}-\d{4}/, replace: '***-****-****', label: '전화번호' },
  { pattern: /\d{6}-\d{7}/,       replace: '******-*******', label: '주민번호' },
  { pattern: /[가-힣]{2,4}\s*\d{10,16}/, replace: '[계좌번호 마스킹]', label: '계좌번호' },
  { pattern: /[\w.-]+@[\w.-]+\.\w+/, replace: '[이메일 마스킹]', label: '이메일' },
];

// 보안 공격 패턴
const SECURITY_PATTERNS = [
  /시스템.{0,10}프롬프트/,
  /prompt.{0,10}inject/i,
  /ignore.{0,10}previous/i,
  /당신의.{0,10}(설정|지침|명령)/,
  /탈옥/,
  /jailbreak/i,
];

class TrapValidator {
  constructor() {
    this._counts = { trap1: 0, trap2: 0, trap3: 0, cosmLaw: 0, piiMasked: 0, security: 0 };
  }

  getBlockStats() {
    return { ...this._counts };
  }

  /**
   * 입력 검증
   */
  validateInput(input) {
    const issues = [];

    // 보안 공격 탐지
    if (SECURITY_PATTERNS.some(p => p.test(input))) {
      issues.push({ type: 'SECURITY', severity: 'BLOCK', msg: '허용되지 않는 요청입니다.' });
      this._counts.security++;
    }

    return { valid: issues.filter(i => i.severity === 'BLOCK').length === 0, issues };
  }

  /**
   * 응답 검증 (함정 3종 + 컴플 6항목)
   * @returns {{ valid, issues, sanitized }}
   */
  validateResponse(response, context = {}) {
    const issues = [];
    let sanitized = response;

    // ── 함정 1: KB 없는 추측 응답 ──
    if (context.searchScore !== undefined && context.searchScore < 0.05) {
      if (!response.includes('KB에') && !response.includes('담당자')) {
        issues.push({
          type: 'TRAP1_HALLUCINATION',
          severity: 'WARN',
          msg: '검색 결과 없는데 응답 생성됨 → 정보부재 처리 필요',
        });
        this._counts.trap1++;
      }
    }

    // ── 함정 2: 책임 단정 ──
    const definitePatterns = ['100% 회사', '100% 고객', '무조건 됩니다', '절대 안됩니다'];
    if (definitePatterns.some(p => response.includes(p))) {
      issues.push({
        type: 'TRAP2_DEFINITE',
        severity: 'WARN',
        msg: '책임 단정 표현 감지 → 케이스별 안내로 수정 필요',
      });
      this._counts.trap2++;
    }

    // ── 함정 3: 복합 단답 ──
    if (context.isMultiTopic && !response.includes('①') && !response.includes('1)') && !response.includes('\n')) {
      issues.push({
        type: 'TRAP3_SINGLE_ANSWER',
        severity: 'WARN',
        msg: '복합 질문에 단답 응답 → 항목별 분리 필요',
      });
      this._counts.trap3++;
    }

    // ── 화장품법 위반 ──
    if (COSM_LAW_VIOLATIONS.some(p => p.test(response))) {
      issues.push({
        type: 'COSM_LAW_VIOLATION',
        severity: 'BLOCK',
        msg: '화장품법 위반 표현 감지 — 응답 차단',
      });
      sanitized = this._cosmLawFallback();
      this._counts.cosmLaw++;
    }

    // ── 개인정보 마스킹 ──
    PII_PATTERNS.forEach(({ pattern, replace, label }) => {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, replace);
        issues.push({ type: 'PII_MASKED', severity: 'INFO', msg: `${label} 마스킹 적용` });
        this._counts.piiMasked++;
      }
    });

    // ── 카카오톡 길이 제한 ──
    if (context.channel === 'kakao' && sanitized.length > 200) {
      sanitized = sanitized.substring(0, 190) + '…\n더 알고 싶으시면 말씀해 주세요!';
      issues.push({ type: 'KAKAO_TRUNCATE', severity: 'INFO', msg: '카카오톡 200자 초과 → 자동 압축' });
    }

    const blocked = issues.some(i => i.severity === 'BLOCK');
    return { valid: !blocked, issues, sanitized };
  }

  _cosmLawFallback() {
    return '해당 내용은 전성분 확인 또는 전문의 상담 후 결정하시는 것을 권장드려요 💚\n담당자 연결 도와드릴까요?';
  }

  // 개인정보 마스킹만 적용
  maskPII(text) {
    let result = text;
    PII_PATTERNS.forEach(({ pattern, replace }) => {
      result = result.replace(pattern, replace);
    });
    return result;
  }
}

const trapValidator = new TrapValidator();
module.exports = { trapValidator, TrapValidator };
