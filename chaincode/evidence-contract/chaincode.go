package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Minimal local interfaces/types to avoid depending on external contractapi
// when the module is not available. These mirror only the methods/fields
// used by this file so it can compile in environments without the
// fabric-contract-api-go module.
type TransactionContextInterface interface {
	GetStub() ChaincodeStubInterface
}

type ChaincodeStubInterface interface {
	GetState(key string) ([]byte, error)
	PutState(key string, value []byte) error
	GetHistoryForKey(key string) (HistoryQueryIteratorInterface, error)
}

type HistoryQueryIteratorInterface interface {
	HasNext() bool
	Next() (*KeyModification, error)
	Close() error
}

type KeyModification struct {
	TxId      string
	Timestamp Timestamp
	IsDelete  bool
	Value     []byte
}

type Timestamp struct {
	Seconds int64
	Nanos   int32
}

func (t Timestamp) AsTime() time.Time {
	return time.Unix(t.Seconds, int64(t.Nanos)).UTC()
}

// EvidenceContract no longer embeds contractapi.Contract to avoid import.
type EvidenceContract struct{}

// EvidenceAsset mirrors the metadata bundle produced by evidence_capture_pipeline.py
// (video_id, cid, hashes, wrapped key, algorithm tags) plus a custody log,
// matching the mock_fabric_ledger.py structure validated earlier.
type EvidenceAsset struct {
	VideoID            string        `json:"videoId"`
	CameraID           string        `json:"cameraId"`
	SubmittingOrg      string        `json:"submittingOrg"`
	CaptureStartUTC    string        `json:"captureStartUtc"`
	CaptureEndUTC      string        `json:"captureEndUtc"`
	SHA256Plaintext    string        `json:"sha256Plaintext"`
	SHA256Ciphertext   string        `json:"sha256Ciphertext"`
	CID                string        `json:"cid"`
	WrappedKeyB64      string        `json:"wrappedKeyB64"`
	EphemeralPubKeyPEM string        `json:"ephemeralPubkeyPem"`
	Algorithm          Algorithm     `json:"algorithm"`
	CustodyLog         []CustodyStep `json:"custodyLog"`
}

type Algorithm struct {
	BulkCipher string `json:"bulkCipher"`
	KeyWrap    string `json:"keyWrap"`
}

type CustodyStep struct {
	Action    string `json:"action"` // "CREATE" or "TRANSFER_CUSTODY"
	Org       string `json:"org"`    // org that performed the action
	ToOrg     string `json:"toOrg,omitempty"`
	Timestamp string `json:"timestamp"`
}

// HistoryEntry is returned by GetAssetHistory, one per ledger revision of the key.
type HistoryEntry struct {
	TxID      string         `json:"txId"`
	Timestamp string         `json:"timestamp"`
	IsDelete  bool           `json:"isDelete"`
	Asset     *EvidenceAsset `json:"asset,omitempty"`
}

type EvidenceContract struct {
	contractapi.Contract
}

// CreateAsset writes a new evidence record to the ledger, keyed by VideoID.
// Called once, by the org that captured the evidence (per our design: Org1
// on channel1-2 for the initial capture->Lab handoff).
func (c *EvidenceContract) CreateAsset(ctx contractapi.TransactionContextInterface,
	videoID string, cameraID string, submittingOrg string,
	captureStartUTC string, captureEndUTC string,
	sha256Plaintext string, sha256Ciphertext string, cid string,
	wrappedKeyB64 string, ephemeralPubKeyPEM string,
	bulkCipher string, keyWrap string) error {

	exists, err := c.AssetExists(ctx, videoID)
	if err != nil {
		return fmt.Errorf("failed checking asset existence: %w", err)
	}
	if exists {
		return fmt.Errorf("asset %s already exists", videoID)
	}

	if cid == "" || sha256Ciphertext == "" {
		return fmt.Errorf("cid and sha256Ciphertext are required fields")
	}

	asset := EvidenceAsset{
		VideoID:            videoID,
		CameraID:           cameraID,
		SubmittingOrg:      submittingOrg,
		CaptureStartUTC:    captureStartUTC,
		CaptureEndUTC:      captureEndUTC,
		SHA256Plaintext:    sha256Plaintext,
		SHA256Ciphertext:   sha256Ciphertext,
		CID:                cid,
		WrappedKeyB64:      wrappedKeyB64,
		EphemeralPubKeyPEM: ephemeralPubKeyPEM,
		Algorithm:          Algorithm{BulkCipher: bulkCipher, KeyWrap: keyWrap},
		CustodyLog: []CustodyStep{
			{
				Action:    "CREATE",
				Org:       submittingOrg,
				Timestamp: time.Now().UTC().Format(time.RFC3339),
			},
		},
	}

	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset: %w", err)
	}

	return ctx.GetStub().PutState(videoID, assetJSON)
}

// ReadAsset returns the current state of an evidence record.
func (c *EvidenceContract) ReadAsset(ctx contractapi.TransactionContextInterface,
	videoID string) (*EvidenceAsset, error) {

	assetJSON, err := ctx.GetStub().GetState(videoID)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %w", err)
	}
	if assetJSON == nil {
		return nil, fmt.Errorf("asset %s does not exist", videoID)
	}

	var asset EvidenceAsset
	if err := json.Unmarshal(assetJSON, &asset); err != nil {
		return nil, fmt.Errorf("failed to unmarshal asset: %w", err)
	}
	return &asset, nil
}

// AssetExists checks whether a given VideoID is already on the ledger.
func (c *EvidenceContract) AssetExists(ctx contractapi.TransactionContextInterface,
	videoID string) (bool, error) {

	assetJSON, err := ctx.GetStub().GetState(videoID)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %w", err)
	}
	return assetJSON != nil, nil
}

// TransferCustody records a re-wrap event: the AES key has been re-wrapped
// for the next org in the custody chain (e.g. Org1 -> Org2, or a later
// submission to Org3 on channel1-3/channel2-3). CID and hashes never
// change here -- only the wrapped-key material and the custody log update.
// This is the sequential re-wrap model from our architecture discussion,
// each call is itself an auditable, endorsed, timestamped transaction.
func (c *EvidenceContract) TransferCustody(ctx contractapi.TransactionContextInterface,
	videoID string, newWrappedKeyB64 string, newEphemeralPubKeyPEM string,
	fromOrg string, toOrg string) error {

	asset, err := c.ReadAsset(ctx, videoID)
	if err != nil {
		return err
	}

	asset.WrappedKeyB64 = newWrappedKeyB64
	asset.EphemeralPubKeyPEM = newEphemeralPubKeyPEM
	asset.CustodyLog = append(asset.CustodyLog, CustodyStep{
		Action:    "TRANSFER_CUSTODY",
		Org:       fromOrg,
		ToOrg:     toOrg,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})

	assetJSON, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("failed to marshal asset: %w", err)
	}

	return ctx.GetStub().PutState(videoID, assetJSON)
}

// GetAssetHistory returns every ledger revision for a given VideoID, using
// Fabric's native key history index -- this is the append-only audit trail
// a court would want to see (create, then each subsequent custody transfer).
func (c *EvidenceContract) GetAssetHistory(ctx contractapi.TransactionContextInterface,
	videoID string) ([]HistoryEntry, error) {

	resultsIterator, err := ctx.GetStub().GetHistoryForKey(videoID)
	if err != nil {
		return nil, fmt.Errorf("failed to get history for %s: %w", videoID, err)
	}
	defer resultsIterator.Close()

	var history []HistoryEntry
	for resultsIterator.HasNext() {
		modification, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		entry := HistoryEntry{
			TxID:      modification.TxId,
			Timestamp: modification.Timestamp.AsTime().UTC().Format(time.RFC3339),
			IsDelete:  modification.IsDelete,
		}

		if !modification.IsDelete && len(modification.Value) > 0 {
			var asset EvidenceAsset
			if err := json.Unmarshal(modification.Value, &asset); err != nil {
				return nil, fmt.Errorf("failed to unmarshal history entry: %w", err)
			}
			entry.Asset = &asset
		}

		history = append(history, entry)
	}

	return history, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&EvidenceContract{})
	if err != nil {
		panic(fmt.Sprintf("Error creating evidence chaincode: %v", err))
	}
	if err := chaincode.Start(); err != nil {
		panic(fmt.Sprintf("Error starting evidence chaincode: %v", err))
	}
}
