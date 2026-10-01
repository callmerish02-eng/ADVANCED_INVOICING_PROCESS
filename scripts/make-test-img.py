# Create a tiny PNG to test the upload endpoint
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (800, 600), 'white')
d = ImageDraw.Draw(img)
d.text((50, 50), "TEST INVOICE", fill='black')
d.text((50, 100), "Vendor: ABC Pvt Ltd", fill='black')
d.text((50, 130), "Amount: 15000.00", fill='black')
d.text((50, 160), "GST: 2700.00", fill='black')
img.save('/home/z/my-project/download/test-invoice.png')
print('saved')



