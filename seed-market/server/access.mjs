export function buyerAccess(idea,{hasView=false,hasUse=false,hasOrders=false,orderId=null}={}){
  let state="unowned",label="열람권 구매 전",description="상세 열람권을 구매한 뒤 자료를 볼 수 있어요.";
  if(idea.review_status!=="approved"&&idea.reviewStatus!=="approved"){
    state="suspended";label="게시 중단 · 열람 보류";description="게시 검토로 상세 열람이 중단됐어요. 결제 기록에서 거래 문의를 접수할 수 있어요.";
  }else if(hasUse){state="exclusive";label="내 독점 사용권";description="독점 사용권 테스트 구매를 완료했어요. 상세 자료를 확인할 수 있어요.";}
  else if(idea.status==="sold"){state="sold";label="판매완료 · 재열람 종료";description="독점 사용권 판매완료로 상세 재열람이 종료됐어요. 결제와 서약 기록은 계속 확인할 수 있어요.";}
  else if(hasView){state="view";label="상세 열람 가능";description="열람권을 보유하고 있어요. 사용하려면 별도 독점 사용권이 필요해요.";}
  else if(hasOrders){state="refunded";label="환불 완료 · 열람권 없음";description="환불된 열람권으로는 상세 자료를 볼 수 없어요. 판매 중이면 새 열람권을 구매할 수 있어요.";}
  return {state,label,description,canView:["view","exclusive"].includes(state),orderId};
}
