const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── 입금 계좌 정보 (관리자가 바꿀 경우 여기만 수정) ────────────────────────────
const BANK_INFO = {
  bankName: 'IBK기업은행',
  bankNameEn: 'IBK (Industrial Bank of Korea)',
  accountNumber: '305-019152-01-022',
  accountHolder: '이미화'
};

async function resolvePayerId(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) return data.user.id;
  }
  const { nickname, email } = req.body;
  if (nickname && email) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname)
      .eq('email', email)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// ─── 입금 계좌 정보 조회 (프론트 표시용) ────────────────────────────────────────
router.get('/info', (req, res) => {
  res.json(BANK_INFO);
});

// ─── 무통장입금 신청 ─────────────────────────────────────────────────────────
router.post('/request', async (req, res) => {
  try {
    const { depositorName, amount } = req.body;
    const amountNum = Number(amount);

    if (!depositorName || !depositorName.trim()) {
      return res.status(400).json({ error: '입금자명을 입력해 주세요.', errorEn: 'Please enter the depositor name.' });
    }
    if (!amountNum || amountNum < 1000) {
      return res.status(400).json({ error: '충전금액은 1,000원 이상이어야 합니다.', errorEn: 'Amount must be at least 1,000 KRW.' });
    }

    const payerId = await resolvePayerId(req);
    if (!payerId) {
      return res.status(401).json({ error: '등록된 닉네임과 이메일이 일치하지 않습니다. 정확히 입력해 주세요.', errorEn: 'The nickname and email do not match a registered account. Please check and try again.' });
    }

    const { data, error } = await supabase
      .from('bank_transfer_requests')
      .insert({
        user_id: payerId,
        depositor_name: depositorName.trim(),
        amount_krw: amountNum,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('[bank-transfer] 신청 저장 오류:', error);
      return res.status(500).json({ error: '신청 처리 중 오류가 발생했습니다.' });
    }

    console.log(`[bank-transfer] 신청 접수: id=${data.id}, ${amountNum}원, 입금자=${depositorName}`);

    return res.json({
      message: '입금 신청이 접수되었습니다. 입금 확인 후 포인트가 적립됩니다 (통상 12시간 이내).',
      messageEn: 'Your deposit request has been received. Points will be credited once the transfer is confirmed (usually within 12 hours).',
      requestId: data.id,
      bankInfo: BANK_INFO
    });
  } catch (err) {
    console.error('[bank-transfer] request 오류:', err);
    return res.status(500).json({ error: '처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
