import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireUser } from '@/lib/session';

const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp']);

function extensionFor(contentType:string){
  if(contentType==='image/png') return 'png';
  if(contentType==='image/webp') return 'webp';
  return 'jpg';
}

export async function POST(req:NextRequest){
  const user=await requireUser();
  if(!user) return NextResponse.json({error:'Inte inloggad'},{status:401});

  const body=await req.json().catch(()=>null);
  const contentType=String(body?.content_type||'');
  const size=Number(body?.size||0);

  if(!ALLOWED.has(contentType)){
    return NextResponse.json({error:'Bilden måste vara JPG, PNG eller WebP.'},{status:400});
  }
  if(!Number.isFinite(size) || size<=0 || size>MAX_SIZE){
    return NextResponse.json({error:'Bilden får vara högst 8 MB.'},{status:400});
  }

  const endpoint=process.env.NEON_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
  const region=process.env.NEON_STORAGE_REGION || process.env.AWS_REGION || 'eu-central-1';
  const bucket=process.env.NEON_STORAGE_BUCKET || 'card-images';
  const accessKeyId=process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey=process.env.AWS_SECRET_ACCESS_KEY;

  if(!endpoint || !accessKeyId || !secretAccessKey){
    return NextResponse.json({error:'Bilduppladdning är inte konfigurerad på servern ännu.'},{status:503});
  }

  const key=`cards/${user.id}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  const s3=new S3Client({
    region,
    endpoint,
    forcePathStyle:true,
    credentials:{accessKeyId,secretAccessKey}
  });

  const uploadUrl=await getSignedUrl(
    s3,
    new PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType}),
    {expiresIn:300}
  );

  const publicUrl=`${endpoint.replace(/\/$/,'')}/${bucket}/${key}`;
  return NextResponse.json({upload_url:uploadUrl,public_url:publicUrl,key});
}
