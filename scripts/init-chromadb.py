"""
ChromaDB 초기화 스크립트
무료 오픈소스 벡터DB — AI API 미사용

실행: python scripts/init-chromadb.py
사전 조건: pip install chromadb
"""

import chromadb
import json
import os
import math
import re
from collections import Counter

PERSIST_PATH = "./data/chromadb"
FAQ_PATH     = None  # Node.js에서 JSON 내보낸 경우

# ── 간단한 한국어 TF-IDF 임베딩 (Python 버전) ──
class SimpleTFIDF:
    def __init__(self):
        self.vocab = {}
        self.idf   = {}
        self.n_docs = 0

    def tokenize(self, text):
        text = text.lower().strip()
        words = re.split(r'\s+', text)
        words = [w for w in words if len(w) >= 2]
        bigrams = [f"{words[i]}_{words[i+1]}" for i in range(len(words)-1)]
        return words + bigrams

    def fit(self, docs):
        self.n_docs = len(docs)
        df = Counter()
        for doc in docs:
            tokens = set(self.tokenize(doc))
            df.update(tokens)
        for i, word in enumerate(df):
            self.vocab[word] = i
            self.idf[word] = math.log(self.n_docs / df[word]) + 1
        return self

    def transform(self, text):
        tokens = self.tokenize(text)
        tf = Counter(tokens)
        vec = [0.0] * len(self.vocab)
        for word, count in tf.items():
            idx = self.vocab.get(word)
            if idx is not None:
                vec[idx] = (count / len(tokens)) * self.idf.get(word, 0)
        # L2 정규화
        norm = math.sqrt(sum(v*v for v in vec))
        if norm > 0:
            vec = [v/norm for v in vec]
        return vec


# ── FAQ 데이터 (Python 내장) ──
FAQ_DATA = [
    # [주문·결제]
    {"id":"Q01","cat":"주문·결제","q":"주문 후 결제 수단을 변경할 수 있나요?","a":"결제 완료 이후에는 결제 수단 변경이 원칙적으로 불가합니다. 주문 취소 후 재주문하시면 원하시는 결제 수단을 선택하실 수 있습니다.","kw":"결제 변경 취소 재주문"},
    {"id":"Q02","cat":"주문·결제","q":"주문한 제품을 취소하고 싶어요.","a":"배송 준비 중 이전 단계라면 주문 내역에서 직접 취소가 가능합니다. 이미 배송이 시작된 경우에는 수령 후 반품 절차를 이용하세요.","kw":"취소 주문취소 환불 배송"},
    {"id":"Q05","cat":"주문·결제","q":"할인 쿠폰과 적립금을 동시에 사용할 수 있나요?","a":"대부분의 경우 쿠폰과 적립금 중복 사용이 가능합니다. 일부 프로모션 쿠폰은 중복 적용이 제한될 수 있으며, 결제 화면에서 사전에 안내됩니다.","kw":"쿠폰 적립금 중복 동시사용"},
    {"id":"Q07","cat":"배송","q":"주문 후 배송까지 얼마나 걸리나요?","a":"결제 완료 후 영업일 기준 1~2일 이내 출고되며, 출고 후 택배사 기준 1~3일이 소요됩니다. 수도권 2~3일, 도서·산간 지역 3~5일 추가될 수 있습니다.","kw":"배송 기간 며칠 언제 소요"},
    {"id":"Q09","cat":"배송","q":"도서·산간 지역에도 배송되나요?","a":"제주 및 도서·산간 지역도 배송 가능합니다. 추가 배송비(제주 3,000원~)가 발생하며 배송 기간도 2~3일 추가될 수 있습니다.","kw":"제주 도서 산간 배송비 추가"},
    {"id":"Q11","cat":"배송","q":"제품이 파손된 상태로 배송됐어요.","a":"파손 배송 확인 즉시 외관 사진과 함께 고객센터로 접수해 주세요. 수령 후 7일 이내 접수 시 무상 교환 또는 환불 처리가 가능합니다. 배송 파손은 판매자 귀책이므로 왕복 배송비가 무료입니다.","kw":"파손 배송파손 교환 환불 무료"},
    {"id":"Q13","cat":"교환·환불","q":"반품·교환 신청 기간이 어떻게 되나요?","a":"전자상거래법에 따라 제품 수령일로부터 7일 이내에 청약철회(반품)가 가능합니다. 제품 불량이나 오배송의 경우에는 수령일로부터 30일 이내 청구 가능합니다.","kw":"반품 교환 기간 7일 청약철회"},
    {"id":"Q15","cat":"교환·환불","q":"개봉한 화장품도 반품이 가능한가요?","a":"화장품 특성상 개봉 후 사용한 제품은 위생 및 재판매 불가 사유로 반품이 원칙적으로 제한됩니다. 제품에 하자가 있거나 설명과 다른 경우에는 교환·환불이 가능합니다.","kw":"개봉 사용 반품 제한 하자"},
    {"id":"Q17","cat":"교환·환불","q":"쿠폰 적용 제품을 환불 받으면 쿠폰도 돌아오나요?","a":"쿠폰 조건에 따라 다릅니다. 일회성 사용 쿠폰의 경우 복원이 불가하며, 이벤트 쿠폰은 정책에 따라 복원 여부가 결정됩니다. 적립금은 사용분만큼 원상 복구됩니다.","kw":"쿠폰 환불 복원 적립금"},
    {"id":"Q21","cat":"제품·성분","q":"제품 성분 전체 목록은 어디서 확인할 수 있나요?","a":"제품 상세 페이지 내 전성분 보기에서 확인 가능합니다. 화장품법에 따라 모든 성분은 많이 들어간 순서(내림차순)로 표기해야 합니다.","kw":"성분 전성분 목록 확인 화장품법"},
    {"id":"Q25","cat":"제품·성분","q":"임산부도 사용할 수 있는 제품인가요?","a":"임산부의 경우 레티놀, 살리실산, 일부 에센셜 오일 등의 성분은 사용을 권장하지 않습니다. 전성분 확인 후 산부인과 전문의에게 상담 후 사용하시기 바랍니다.","kw":"임산부 임신 레티놀 살리실산 주의"},
    {"id":"Q29","cat":"피부 트러블","q":"제품 사용 후 발진·가려움이 생겼어요.","a":"즉시 사용을 중단하고 깨끗한 물로 세안 후 보습제를 발라 주세요. 증상이 심하면 피부과 진료를 받으시길 권장합니다. 로트번호와 증상을 고객센터에 알려 주시면 성분 분석 자료를 제공해 드립니다.","kw":"발진 가려움 트러블 부작용 알러지 피부"},
    {"id":"Q35","cat":"회원·혜택","q":"회원 등급은 어떻게 결정되나요?","a":"연간 구매 금액을 기준으로 Bronze > Silver > Gold > VIP 등 4~5단계로 구분됩니다. 등급별로 적립률 차등, 생일 쿠폰, 전용 이벤트 등 혜택이 제공됩니다.","kw":"등급 VIP 골드 실버 브론즈 멤버십"},
    {"id":"Q41","cat":"안전·법규","q":"화장품 부작용 신고는 어떻게 하나요?","a":"화장품법 제5조에 따라 식품의약품안전처 통합민원상담센터(1577-1255) 또는 이상사례 신고 포털(medwatch.mfds.go.kr)에 신고하실 수 있습니다.","kw":"부작용 신고 식약처 화장품법"},
    {"id":"Q44","cat":"안전·법규","q":"개인정보는 어떻게 관리되나요?","a":"수집된 개인정보는 개인정보보호법과 당사 개인정보처리방침에 따라 보호됩니다. 구매·배송 관련 정보는 법정 보존 기간(전자상거래법 5년) 동안 보관 후 파기됩니다.","kw":"개인정보 보관 5년 파기 보호"},
    {"id":"Q45","cat":"안전·법규","q":"미성년자도 회원 가입 및 구매가 가능한가요?","a":"만 14세 미만의 경우 법정 대리인(부모 등)의 동의가 필요합니다. 만 14세 이상 미성년자는 법정 대리인 동의 하에 가입 가능합니다.","kw":"미성년자 14세 청소년 법정대리인"},
    {"id":"Q48","cat":"채널·서비스","q":"고객센터 운영 시간은 어떻게 되나요?","a":"유선 상담: 월~금 오전 9시~오후 6시(공휴일 제외). 온라인 채팅·이메일은 24시간 접수 가능하며, 답변은 영업일 기준 24시간 이내 제공됩니다.","kw":"고객센터 운영시간 상담 전화 이메일"},
]

def main():
    print("=" * 50)
    print("JHC Honey ChromaDB 초기화")
    print("무료 오픈소스 벡터DB — AI API 미사용")
    print("=" * 50)

    # 데이터 디렉토리 생성
    os.makedirs(PERSIST_PATH, exist_ok=True)
    os.makedirs("./data", exist_ok=True)

    # ChromaDB 클라이언트 (로컬 파일 저장)
    client = chromadb.PersistentClient(path=PERSIST_PATH)

    # 기존 컬렉션 삭제 후 재생성
    try:
        client.delete_collection("jhc_faq_v2")
        print("기존 컬렉션 삭제 완료")
    except:
        pass

    collection = client.create_collection(
        name="jhc_faq_v2",
        metadata={"hnsw:space": "cosine"},
    )
    print(f"컬렉션 생성: jhc_faq_v2")

    # TF-IDF 학습
    all_texts = [f"{d['q']} {d['a']} {d['kw']}" for d in FAQ_DATA]
    embedder = SimpleTFIDF()
    embedder.fit(all_texts)
    print(f"TF-IDF 학습 완료: 어휘 {len(embedder.vocab)}개")

    # 임베딩 생성 및 저장
    ids        = [d['id'] for d in FAQ_DATA]
    embeddings = [embedder.transform(f"{d['q']} {d['a']} {d['kw']}") for d in FAQ_DATA]
    documents  = [f"{d['q']} {d['a']}" for d in FAQ_DATA]
    metadatas  = [{"category": d['cat'], "question": d['q'], "answer": d['a']} for d in FAQ_DATA]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )
    print(f"FAQ {len(FAQ_DATA)}개 인덱싱 완료")

    # 테스트 쿼리
    test = "환불 가능한가요?"
    qvec = embedder.transform(test)
    results = collection.query(query_embeddings=[qvec], n_results=3)
    print(f"\n테스트 검색: '{test}'")
    for i, (doc, dist) in enumerate(zip(results['documents'][0], results['distances'][0])):
        score = 1 - dist
        print(f"  [{i+1}] 유사도: {score:.3f} | {doc[:60]}...")

    print("\n✅ ChromaDB 초기화 완료!")
    print(f"저장 경로: {PERSIST_PATH}")

if __name__ == "__main__":
    main()
