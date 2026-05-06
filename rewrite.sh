#!/bin/bash
git filter-branch -f --msg-filter '
  MSG=$(cat)
  if echo "$MSG" | grep -q "fix: remove full reload to prevent scroll jumping on BOM page"; then
    echo "수정: BOM 페이지에서 스크롤 튐 방지를 위해 전체 새로고침 제거"
  elif echo "$MSG" | grep -q "fix: prevent scroll jump when updating bom quantity"; then
    echo "수정: BOM 수량 업데이트 시 스크롤 튐 방지"
  elif echo "$MSG" | grep -q "feat: add multi-select custom dropdown for BOM"; then
    echo "기능: BOM용 다중 선택 커스텀 드롭다운 추가"
  elif echo "$MSG" | grep -q "feat: cascade delete for product shipments and material transactions"; then
    echo "기능: 제품 출고 및 자재 트랜잭션 연쇄 삭제 추가"
  elif echo "$MSG" | grep -q "fix: bom quantity input step to 1"; then
    echo "수정: BOM 수량 입력 단위를 1로 변경"
  elif echo "$MSG" | grep -q "feat: add charts and bulk delete feature"; then
    echo "기능: 차트 및 일괄 삭제 기능 추가"
  elif echo "$MSG" | grep -q "feat: add monthly and yearly product shipment reports"; then
    echo "기능: 월간 및 연간 제품 출고 보고서 추가"
  elif echo "$MSG" | grep -q "fix: remove relational data from projects update payload"; then
    echo "수정: 프로젝트 업데이트 페이로드에서 관계형 데이터 제거"
  elif echo "$MSG" | grep -q "feat: add project management and update shipments"; then
    echo "기능: 프로젝트 관리 및 출고 업데이트 기능 추가"
  elif echo "$MSG" | grep -q "fix: restore missing handleDelete syntax in clients"; then
    echo "수정: 클라이언트의 누락된 handleDelete 구문 복구"
  elif echo "$MSG" | grep -q "feat: add bulk csv upload for materials, products, clients"; then
    echo "기능: 자재, 제품, 클라이언트용 일괄 CSV 업로드 추가"
  elif echo "$MSG" | grep -q "fix: disable strict typescript for build"; then
    echo "수정: 빌드를 위해 엄격한 타입스크립트 검사 비활성화"
  elif echo "$MSG" | grep -q "fix: typescript type errors for build"; then
    echo "수정: 빌드용 타입스크립트 타입 에러 수정"
  elif echo "$MSG" | grep -q "first commit: inventory management system"; then
    echo "초기 커밋: 재고 관리 시스템"
  else
    echo "$MSG"
  fi
' -- --all
