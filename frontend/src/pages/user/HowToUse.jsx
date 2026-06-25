import React from 'react';
import { HelpCircle, Wifi, Users, FileText, Megaphone, ShieldAlert } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../components/ui/Card';

export default function HowToUse() {
  return (
    <div className="space-y-6">
      {/* Disclaimer Alert */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0 text-red-600">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-900">Important Disclaimer & Anti-Spam Policy</h3>
          <p className="text-xs text-red-700 leading-relaxed">
            <strong>Send at Your Own Risk:</strong> You are solely responsible for the messages you send using this platform. Feelaxo does not assume any liability for WhatsApp account blocks, number bans, or regulatory penalties resulting from your message campaigns.
          </p>
          <p className="text-xs text-red-700 leading-relaxed">
            <strong>Don't Spam:</strong> Sending bulk unsolicited messages is a violation of WhatsApp's Terms of Service. Ensure you only message contacts who have opted-in or explicitly consented to receive communications from you. Maintain a delay between messages to lower your risk.
          </p>
        </div>
      </div>

      {/* Guide Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold text-surface-800">
            <HelpCircle className="w-5 h-5 text-brand-500" />
            Getting Started with Feelaxo
          </CardTitle>
        </CardHeader>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-800 flex items-center gap-1.5">
                  <Wifi className="w-4 h-4 text-brand-500" />
                  Connect WhatsApp
                </h4>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Go to the <strong>WhatsApp</strong> tab and click <strong>Connect</strong>. A QR code will display. Open WhatsApp on your phone, go to Linked Devices, and scan the QR code. Keep your device connected to ensure messages can send.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                2
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-800 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-brand-500" />
                  Manage Contacts & Groups
                </h4>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Navigate to the <strong>Contacts</strong> tab. You can add contacts manually or upload a CSV file using our downloadable template. Create <strong>Groups</strong> to organize your contacts and import lists directly into named groups.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                3
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-800 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-brand-500" />
                  Create Message Templates
                </h4>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Go to <strong>Templates</strong> to construct message formats. You can use dynamic variables like <code>{`{{name}}`}</code>, <code>{`{{email}}`}</code>, or <code>{`{{phone}}`}</code> to personalize your alerts. Attach media (images, videos, documents) to make them engaging.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                4
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-surface-800 flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4 text-brand-500" />
                  Launch Campaigns
                </h4>
                <p className="text-xs text-surface-500 leading-relaxed">
                  Select <strong>Campaigns</strong> and click <strong>New Campaign</strong>. Choose a template and pick target contacts (which can be filtered by groups). Once created, click <strong>Start</strong> to begin sending. Real-time metrics will update automatically.
                </p>
              </div>
            </div>

          </div>

          <div className="border-t border-surface-100 pt-6 space-y-3">
            <h4 className="text-sm font-semibold text-surface-800">Best Practices to Protect Your Number</h4>
            <ul className="list-disc list-inside text-xs text-surface-500 space-y-1.5 leading-relaxed">
              <li><strong>Cooling Time:</strong> The system enforces a randomized delay of 30 to 60 seconds between each message. Never attempt to bypass or reduce this delay, as it helps mimic normal human behavior.</li>
              <li><strong>Personalization:</strong> Always personalize your template message text with contact name variables so that every message sent is unique.</li>
              <li><strong>Consent First:</strong> Never message cold leads. If recipients click "Report Spam" or "Block" on WhatsApp, WhatsApp's automated systems will quickly flag and ban your sender number.</li>
              <li><strong>Opt-Out Options:</strong> Always give recipients a clear way to opt-out (e.g., "Reply STOP to unsubscribe") and promptly delete or group them out from future campaigns.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
