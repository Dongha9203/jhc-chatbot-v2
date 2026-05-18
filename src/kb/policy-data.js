'use strict';

/**
 * JHC 정책 KB — 4건 (기존 구축 완료)
 * FAQ 50문항과 별도로 관리되는 핵심 정책 문서
 */

const POLICY_DATA = [
  {
    id:       'POL01',
    category: '환불·교환 정책',
    title:    '7일 이내 미개봉 환불 정책',
    keywords: ['환불', '7일', '청약철회', '반품', '미개봉', '반환'],
    content:  '구매 후 7일 이내 미개봉 제품은 단순 변심으로도 환불이 가능합니다. 왕복 배송비(약 6,000원)는 고객 부담입니다. 제품 하자나 오배송의 경우 왕복 배송비 무료이며 수령일로부터 30일 이내 청구 가능합니다.',
    law:      '전자상거래 등에서의 소비자보호에 관한 법률 제17조',
    escalate: false,
    sensitive: false,
  },
  {
    id:       'POL02',
    category: '배송 정책',
    title:    '배송 소요일 및 추가 배송비 정책',
    keywords: ['배송', '소요일', '기간', '도서산간', '제주', '추가배송비', '며칠'],
    content:  '결제 완료 후 영업일 기준 1~2일 이내 출고, 출고 후 1~3일 소요됩니다. 수도권 2~3일, 도서·산간 지역 3~5일 추가됩니다. 제주도 추가 배송비 3,000원 발생합니다.',
    law:      null,
    escalate: false,
    sensitive: false,
  },
  {
    id:       'POL03',
    category: 'VIP·멤버십 정책',
    title:    'VIP 등급 및 할인 중복 정책',
    keywords: ['VIP', '등급', '멤버십', '할인중복', '적립률', '브론즈', '실버', '골드'],
    content:  '연간 구매 금액 기준으로 Bronze > Silver > Gold > VIP 단계로 구분됩니다. 등급별 적립률 1~5% 차등 적용. VIP 전용 프로모션과 일반 프로모션 중복 여부는 각 프로모션 조건에 따라 다릅니다.',
    law:      null,
    escalate: false,
    sensitive: false,
  },
  {
    id:       'POL04',
    category: '개인정보 보관 정책',
    title:    '구매·배송 정보 5년 보관 정책',
    keywords: ['개인정보', '보관', '5년', '파기', '개인정보처리', '삭제'],
    content:  '구매·배송 관련 개인정보는 전자상거래법에 따라 5년간 보관 후 파기합니다. 개인정보 열람·정정·삭제 요구는 개인정보 보호책임자에게 문의하실 수 있습니다.',
    law:      '개인정보보호법·전자상거래법',
    escalate: false,
    sensitive: false,
  },
];

module.exports = POLICY_DATA;
